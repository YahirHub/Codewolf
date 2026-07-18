import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  checkInternetConnection,
  getInternetConnectivityState,
  subscribeInternetConnectivity,
} from '../internet-connectivity'

describe('internet-connectivity', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test('reports online when any independent probe reaches an HTTP server', async () => {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.includes('google.com')) throw new Error('blocked')
      return new Response('', { status: 503 })
    }) as unknown as typeof fetch

    expect(await checkInternetConnection()).toBe(true)
    expect(getInternetConnectivityState()).toBe('online')
  })

  test('reports offline only when every probe fails before receiving HTTP', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unreachable')
    }) as unknown as typeof fetch

    expect(await checkInternetConnection()).toBe(false)
    expect(getInternetConnectivityState()).toBe('offline')
  })

  test('publishes connectivity transitions to queue/UI observers', async () => {
    // Establish a deterministic starting state because the connectivity state
    // is intentionally process-wide and survives between calls/tests.
    globalThis.fetch = (async () => new Response('', { status: 204 })) as unknown as typeof fetch
    await checkInternetConnection()

    const states: string[] = []
    const unsubscribe = subscribeInternetConnectivity((state) => states.push(state))

    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await checkInternetConnection()

    globalThis.fetch = (async () => new Response('', { status: 204 })) as unknown as typeof fetch
    await checkInternetConnection()
    unsubscribe()

    expect(states).toContain('offline')
    expect(states.at(-1)).toBe('online')
  })
})
