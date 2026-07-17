import type {
  SecretPromptRequest,
  SecretPromptResponse,
} from '@codebuff/common/types/secret-prompt'

type Listener = (request: SecretPromptRequest | null) => void

type QueueEntry = {
  request: SecretPromptRequest
  resolve: (response: SecretPromptResponse) => void
  signal?: AbortSignal
  abortListener?: () => void
  settled: boolean
}

const queue: QueueEntry[] = []
const listeners = new Set<Listener>()
let activeEntry: QueueEntry | null = null

function notify(): void {
  const request = activeEntry?.request ?? null
  for (const listener of listeners) listener(request)
}

function settleEntry(
  entry: QueueEntry,
  response: SecretPromptResponse,
): void {
  if (entry.settled) return
  entry.settled = true
  if (entry.signal && entry.abortListener) {
    entry.signal.removeEventListener('abort', entry.abortListener)
  }
  entry.resolve(response)
}

function activateNext(): void {
  if (activeEntry || queue.length === 0) {
    notify()
    return
  }

  while (queue.length > 0) {
    const next = queue.shift()!
    if (next.settled) continue
    if (next.signal?.aborted) {
      settleEntry(next, { cancelled: true })
      continue
    }
    activeEntry = next
    notify()
    return
  }

  notify()
}

function removeQueuedEntry(entry: QueueEntry): void {
  const index = queue.indexOf(entry)
  if (index >= 0) queue.splice(index, 1)
}

export const SecretPromptBridge = {
  request(
    request: SecretPromptRequest,
    signal?: AbortSignal,
  ): Promise<SecretPromptResponse> {
    if (signal?.aborted) return Promise.resolve({ cancelled: true })

    return new Promise((resolve) => {
      const entry: QueueEntry = {
        request,
        resolve,
        signal,
        settled: false,
      }

      if (signal) {
        entry.abortListener = () => {
          if (activeEntry === entry) activeEntry = null
          else removeQueuedEntry(entry)
          settleEntry(entry, { cancelled: true })
          activateNext()
        }
        signal.addEventListener('abort', entry.abortListener, { once: true })
      }

      queue.push(entry)
      activateNext()
    })
  },

  respond(value: string): void {
    const entry = activeEntry
    if (!entry) return
    activeEntry = null
    settleEntry(entry, { value })
    activateNext()
  },

  cancel(): void {
    const entry = activeEntry
    if (!entry) return
    activeEntry = null
    settleEntry(entry, { cancelled: true })
    activateNext()
  },

  cancelAll(): void {
    const entries = [...(activeEntry ? [activeEntry] : []), ...queue.splice(0)]
    activeEntry = null
    for (const entry of entries) settleEntry(entry, { cancelled: true })
    notify()
  },

  getPendingRequest(): SecretPromptRequest | null {
    return activeEntry?.request ?? null
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    listener(activeEntry?.request ?? null)
    return () => listeners.delete(listener)
  },

  resetForTests(): void {
    SecretPromptBridge.cancelAll()
    queue.length = 0
    activeEntry = null
    listeners.clear()
  },
}
