import type {
  ToolPermissionDecision,
  ToolPermissionRequest,
  ToolPermissionResponse,
} from '@codebuff/common/types/tool-permission'

type Listener = (request: ToolPermissionRequest | null) => void

type QueueEntry = {
  request: ToolPermissionRequest
  resolve: (response: ToolPermissionResponse) => void
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
  response: ToolPermissionResponse,
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
      settleEntry(next, {
        decision: 'deny',
        message: 'La ejecución fue cancelada antes de autorizar la operación.',
      })
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

export const ToolPermissionBridge = {
  request(
    request: ToolPermissionRequest,
    signal?: AbortSignal,
  ): Promise<ToolPermissionResponse> {
    if (signal?.aborted) {
      return Promise.resolve({
        decision: 'deny',
        message: 'La ejecución fue cancelada antes de autorizar la operación.',
      })
    }

    return new Promise((resolve) => {
      const entry: QueueEntry = {
        request,
        resolve,
        signal,
        settled: false,
      }

      if (signal) {
        entry.abortListener = () => {
          if (activeEntry === entry) {
            activeEntry = null
          } else {
            removeQueuedEntry(entry)
          }
          settleEntry(entry, {
            decision: 'deny',
            message:
              'La ejecución fue cancelada antes de autorizar la operación.',
          })
          activateNext()
        }
        signal.addEventListener('abort', entry.abortListener, { once: true })
      }

      queue.push(entry)
      activateNext()
    })
  },

  respond(decision: ToolPermissionDecision): void {
    const entry = activeEntry
    if (!entry) return
    activeEntry = null
    settleEntry(entry, {
      decision,
      ...(decision === 'deny'
        ? {
            message: 'El usuario rechazó esta operación desde el Modo seguro.',
          }
        : {}),
    })
    activateNext()
  },

  cancelAll(message = 'La ejecución fue cancelada.'): void {
    const entries = [...(activeEntry ? [activeEntry] : []), ...queue.splice(0)]
    activeEntry = null
    for (const entry of entries) {
      settleEntry(entry, { decision: 'deny', message })
    }
    notify()
  },

  getPendingRequest(): ToolPermissionRequest | null {
    return activeEntry?.request ?? null
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    listener(activeEntry?.request ?? null)
    return () => listeners.delete(listener)
  },

  /** Only used by focused unit tests. */
  resetForTests(): void {
    ToolPermissionBridge.cancelAll('Prueba reiniciada.')
    queue.length = 0
    activeEntry = null
    listeners.clear()
  },
}
