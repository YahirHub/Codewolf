import { describe, expect, test, mock, afterEach } from 'bun:test'

import { CodebuffClient } from '../client'

describe('CodebuffClient', () => {
  const originalFetch = globalThis.fetch

  const setFetchMock = (mockFetch: ReturnType<typeof mock>) => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkConnection', () => {
    test('returns true when any public Internet probe receives an HTTP response', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({ status: 204 } as Response),
      )
      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      expect(await client.checkConnection()).toBe(true)
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0)
    })

    test('treats HTTP errors as Internet reachable rather than provider failure', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({ status: 503 } as Response),
      )
      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      expect(await client.checkConnection()).toBe(true)
    })

    test('returns false when every public Internet probe fails at transport level', async () => {
      const mockFetch = mock(() => Promise.reject(new Error('fetch failed')))
      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      expect(await client.checkConnection()).toBe(false)
    })
  })
})
