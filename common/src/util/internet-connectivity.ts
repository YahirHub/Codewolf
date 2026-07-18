export type InternetConnectivityState = 'unknown' | 'online' | 'offline'

export interface InternetConnectivityCheckOptions {
  endpoints?: readonly string[]
  timeoutMs?: number
  signal?: AbortSignal
}

export interface WaitForInternetOptions extends InternetConnectivityCheckOptions {
  retryIntervalMs?: number
}

export const DEFAULT_INTERNET_PROBE_ENDPOINTS = [
  'https://www.google.com/generate_204',
  'https://connectivitycheck.gstatic.com/generate_204',
  'https://www.msftconnecttest.com/connecttest.txt',
  'https://captive.apple.com/hotspot-detect.html',
] as const

export const DEFAULT_INTERNET_PROBE_TIMEOUT_MS = 3_500
export const DEFAULT_INTERNET_RETRY_INTERVAL_MS = 2_000

let currentState: InternetConnectivityState = 'unknown'
const listeners = new Set<(state: InternetConnectivityState) => void>()

function publishState(state: InternetConnectivityState): void {
  if (currentState === state) return
  currentState = state
  for (const listener of listeners) {
    try {
      listener(state)
    } catch {
      // Connectivity observers must never break networking code.
    }
  }
}

export function getInternetConnectivityState(): InternetConnectivityState {
  return currentState
}

export function subscribeInternetConnectivity(
  listener: (state: InternetConnectivityState) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError()
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timeout)
      cleanup()
      reject(createAbortError())
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function probeEndpoint(
  endpoint: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  throwIfAborted(signal)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    })
    // Any HTTP response proves that the machine reached the public Internet.
    // Captive portals may alter the expected body/status, but connectivity is
    // still present and must not be confused with a provider API failure.
    return response.status >= 100 && response.status < 600
  } catch {
    if (signal?.aborted) throw createAbortError()
    return false
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function checkInternetConnection(
  options: InternetConnectivityCheckOptions = {},
): Promise<boolean> {
  const endpoints = options.endpoints ?? DEFAULT_INTERNET_PROBE_ENDPOINTS
  const timeoutMs =
    options.timeoutMs ?? DEFAULT_INTERNET_PROBE_TIMEOUT_MS
  const signal = options.signal

  throwIfAborted(signal)

  if (endpoints.length === 0) {
    publishState('offline')
    return false
  }

  const online = await new Promise<boolean>((resolve, reject) => {
    let settled = false
    let remaining = endpoints.length

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(createAbortError())
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })

    for (const endpoint of endpoints) {
      void probeEndpoint(endpoint, timeoutMs, signal)
        .then((reachable) => {
          if (settled) return
          if (reachable) {
            settled = true
            cleanup()
            resolve(true)
            return
          }
          remaining -= 1
          if (remaining === 0) {
            settled = true
            cleanup()
            resolve(false)
          }
        })
        .catch((error) => {
          if (settled) return
          if (signal?.aborted) {
            settled = true
            cleanup()
            reject(error)
            return
          }
          remaining -= 1
          if (remaining === 0) {
            settled = true
            cleanup()
            resolve(false)
          }
        })
    }
  })

  publishState(online ? 'online' : 'offline')
  return online
}

/**
 * Wait indefinitely for public Internet connectivity to return.
 * Provider HTTP errors never enter this path: callers should invoke this only
 * after a transport-level failure and a separate Internet probe returned false.
 */
export async function waitForInternetConnection(
  options: WaitForInternetOptions = {},
): Promise<void> {
  const retryIntervalMs =
    options.retryIntervalMs ?? DEFAULT_INTERNET_RETRY_INTERVAL_MS

  while (true) {
    throwIfAborted(options.signal)
    if (await checkInternetConnection(options)) return
    await delay(retryIntervalMs, options.signal)
  }
}
