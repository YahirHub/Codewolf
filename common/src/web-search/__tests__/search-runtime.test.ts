import { describe, expect, mock, test } from 'bun:test'

import { runWebSearchWithFallback, testSearchProvider } from '../search-runtime'

import type {
  SearchProviderId,
  WebSearchAuth,
  WebSearchSettings,
} from '../search-config'

function response(
  payload: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function config(
  order: SearchProviderId[],
  keys: Partial<Record<SearchProviderId, string>>,
): { settings: WebSearchSettings; auth: WebSearchAuth } {
  return {
    settings: {
      version: 1,
      defaultProvider: order[0],
      fallbackOrder: order,
      providers: Object.fromEntries(
        Object.keys(keys).map((provider) => [provider, { enabled: true }]),
      ),
    },
    auth: { version: 1, apiKeys: keys },
  }
}

describe('multi-provider web search', () => {
  test('is inactive when no provider is configured', async () => {
    const fetchMock = mock(() => Promise.resolve(response({})))

    await expect(
      runWebSearchWithFallback(
        { query: 'TypeScript' },
        config([], {}),
        undefined,
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('no hay motores habilitados')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('falls back when the default provider is rate-limited', async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.tavily.com/search') {
        return Promise.resolve(
          response({ error: 'quota exceeded' }, 429, { 'retry-after': '60' }),
        )
      }
      if (url === 'https://api.exa.ai/search') {
        return Promise.resolve(
          response({
            results: [
              {
                title: 'Exa result',
                url: 'https://example.com/exa',
                highlights: ['Fallback completed'],
              },
            ],
          }),
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const result = await runWebSearchWithFallback(
      { query: 'latest TypeScript', numResults: 1 },
      config(['tavily', 'exa'], {
        tavily: 'tavily-key',
        exa: 'exa-key',
      }),
      undefined,
      fetchMock as unknown as typeof fetch,
    )

    expect(result.provider).toBe('exa')
    expect(result.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'success',
    ])
    expect(result.text).toContain('Exa result')
    expect(JSON.stringify(result)).not.toContain('exa-key')
  })

  test('normalizes supported providers and follows the complete order', async () => {
    const providers: SearchProviderId[] = [
      'tavily',
      'brave',
      'exa',
      'linkup',
      'firecrawl',
      'serpapi',
      'zenserp',
    ]
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('app.zenserp.com')) {
        return Promise.resolve(
          response({
            organic: [
              {
                title: 'Último respaldo',
                url: 'https://example.com/final',
                description: 'Zenserp funcionó',
              },
            ],
          }),
        )
      }
      return Promise.resolve(response({ error: 'unavailable' }, 503))
    })

    const result = await runWebSearchWithFallback(
      { query: 'fallback completo', numResults: 1 },
      config(
        providers,
        Object.fromEntries(
          providers.map((provider) => [provider, `${provider}-key`]),
        ),
      ),
      undefined,
      fetchMock as unknown as typeof fetch,
    )

    expect(result.provider).toBe('zenserp')
    expect(result.attempts.map((attempt) => attempt.provider)).toEqual(
      providers,
    )
    expect(result.text).toContain('Último respaldo')
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  test('tests a configured provider without exposing its key', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        response({
          organic_results: [
            {
              title: 'TypeScript',
              link: 'https://www.typescriptlang.org/docs/',
              snippet: 'Official documentation',
            },
          ],
        }),
      ),
    )

    const result = await testSearchProvider(
      'serpapi',
      config(['serpapi'], { serpapi: 'secret-serp-key' }),
      'TypeScript',
      undefined,
      fetchMock as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(result.message).toContain('Conexión correcta')
    expect(JSON.stringify(result)).not.toContain('secret-serp-key')
  })
})

describe('provider request adapters', () => {
  const cases: Array<{
    provider: SearchProviderId
    payload: unknown
    expectedEndpoint: string
    assertRequest: (url: string, init: RequestInit | undefined) => void
  }> = [
    {
      provider: 'tavily',
      expectedEndpoint: 'https://api.tavily.com/search',
      payload: {
        results: [
          {
            title: 'Tavily result',
            url: 'https://example.com/tavily',
            content: 'Tavily snippet',
          },
        ],
      },
      assertRequest: (url, init) => {
        expect(url).toBe('https://api.tavily.com/search')
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer tavily-secret',
        )
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body.query).toBe('consulta de prueba')
        expect(body.search_depth).toBe('advanced')
        expect(body.max_results).toBe(2)
      },
    },
    {
      provider: 'brave',
      expectedEndpoint: 'https://api.search.brave.com/res/v1/web/search',
      payload: {
        web: {
          results: [
            {
              title: 'Brave result',
              url: 'https://example.com/brave',
              description: 'Brave snippet',
            },
          ],
        },
      },
      assertRequest: (url, init) => {
        const parsed = new URL(url)
        expect(`${parsed.origin}${parsed.pathname}`).toBe(
          'https://api.search.brave.com/res/v1/web/search',
        )
        expect(parsed.searchParams.get('q')).toBe('consulta de prueba')
        expect(parsed.searchParams.get('count')).toBe('2')
        expect(new Headers(init?.headers).get('x-subscription-token')).toBe(
          'brave-secret',
        )
      },
    },
    {
      provider: 'exa',
      expectedEndpoint: 'https://api.exa.ai/search',
      payload: {
        results: [
          {
            title: 'Exa result',
            url: 'https://example.com/exa',
            highlights: ['Exa snippet'],
          },
        ],
      },
      assertRequest: (url, init) => {
        expect(url).toBe('https://api.exa.ai/search')
        expect(new Headers(init?.headers).get('x-api-key')).toBe('exa-secret')
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body.query).toBe('consulta de prueba')
        expect(body.numResults).toBe(2)
        expect(body.type).toBe('deep')
      },
    },
    {
      provider: 'linkup',
      expectedEndpoint: 'https://api.linkup.so/v1/search',
      payload: {
        results: [
          {
            name: 'Linkup result',
            url: 'https://example.com/linkup',
            content: 'Linkup snippet',
            type: 'text',
          },
        ],
      },
      assertRequest: (url, init) => {
        expect(url).toBe('https://api.linkup.so/v1/search')
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer linkup-secret',
        )
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body.q).toBe('consulta de prueba')
        expect(body.depth).toBe('deep')
        expect(body.outputType).toBe('searchResults')
      },
    },
    {
      provider: 'firecrawl',
      expectedEndpoint: 'https://api.firecrawl.dev/v2/search',
      payload: {
        success: true,
        data: {
          web: [
            {
              title: 'Firecrawl result',
              url: 'https://example.com/firecrawl',
              description: 'Firecrawl snippet',
            },
          ],
        },
      },
      assertRequest: (url, init) => {
        expect(url).toBe('https://api.firecrawl.dev/v2/search')
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer firecrawl-secret',
        )
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body.query).toBe('consulta de prueba')
        expect(body.limit).toBe(2)
        expect(body.sources).toEqual(['web'])
      },
    },
    {
      provider: 'serpapi',
      expectedEndpoint: 'https://serpapi.com/search.json',
      payload: {
        organic_results: [
          {
            title: 'SerpApi result',
            link: 'https://example.com/serpapi',
            snippet: 'SerpApi snippet',
          },
        ],
      },
      assertRequest: (url) => {
        const parsed = new URL(url)
        expect(`${parsed.origin}${parsed.pathname}`).toBe(
          'https://serpapi.com/search.json',
        )
        expect(parsed.searchParams.get('q')).toBe('consulta de prueba')
        expect(parsed.searchParams.get('api_key')).toBe('serpapi-secret')
        expect(parsed.searchParams.get('num')).toBe('2')
      },
    },
    {
      provider: 'zenserp',
      expectedEndpoint: 'https://app.zenserp.com/api/v2/search',
      payload: {
        organic: [
          {
            title: 'Zenserp result',
            url: 'https://example.com/zenserp',
            description: 'Zenserp snippet',
          },
        ],
      },
      assertRequest: (url, init) => {
        const parsed = new URL(url)
        expect(`${parsed.origin}${parsed.pathname}`).toBe(
          'https://app.zenserp.com/api/v2/search',
        )
        expect(parsed.searchParams.get('q')).toBe('consulta de prueba')
        expect(new Headers(init?.headers).get('apikey')).toBe('zenserp-secret')
      },
    },
  ]

  for (const providerCase of cases) {
    test(`builds and normalizes the ${providerCase.provider} request`, async () => {
      const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
        providerCase.assertRequest(String(input), init)
        return Promise.resolve(response(providerCase.payload))
      })

      const result = await runWebSearchWithFallback(
        {
          query: 'consulta de prueba',
          numResults: 2,
          type: 'deep',
        },
        config([providerCase.provider], {
          [providerCase.provider]: `${providerCase.provider}-secret`,
        }),
        undefined,
        fetchMock as unknown as typeof fetch,
      )

      expect(result.provider).toBe(providerCase.provider)
      expect(result.endpoint).toBe(providerCase.expectedEndpoint)
      expect(result.resultCount).toBe(1)
      expect(result.text).toContain('snippet')
      expect(JSON.stringify(result)).not.toContain(
        `${providerCase.provider}-secret`,
      )
    })
  }
})
