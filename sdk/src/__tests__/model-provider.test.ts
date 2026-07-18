import { describe, expect, test, beforeEach } from 'bun:test'

import {
  createInternetRecoveryFetch,
  isChatGptOAuthRateLimited,
  markChatGptOAuthRateLimited,
  resetChatGptOAuthRateLimit,
} from '../impl/model-provider'

describe('model-provider', () => {
  describe('chatgpt oauth rate limiting', () => {
    beforeEach(() => {
      resetChatGptOAuthRateLimit()
    })

    test('isChatGptOAuthRateLimited returns false by default', () => {
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('markChatGptOAuthRateLimited sets rate limit with default time', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('markChatGptOAuthRateLimited respects custom reset time', () => {
      const futureDate = new Date(Date.now() + 60_000)
      markChatGptOAuthRateLimited(futureDate)
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('rate limit expires after reset time', () => {
      const pastDate = new Date(Date.now() - 1_000)
      markChatGptOAuthRateLimited(pastDate)
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('resetChatGptOAuthRateLimit clears rate limit', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)

      resetChatGptOAuthRateLimit()
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })
  })
})

describe('custom provider routing', () => {
  test('never falls back to the original backend when custom-provider context is missing', async () => {
    const { getModelForRequest } = await import('../impl/model-provider')

    await expect(
      getModelForRequest({
        apiKey: 'local-custom-provider:local',
        model: 'google/gemini-3.1-flash-lite',
      }),
    ).rejects.toThrow('no se propagó al agente secundario')
  })

  test('creates a direct OpenAI-compatible model with the selected model id', async () => {
    const { getModelForRequest } = await import('../impl/model-provider')
    const result = await getModelForRequest({
      apiKey: 'unused-local-key',
      model: 'ignored/original-model',
      customProvider: {
        id: 'local',
        name: 'Local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5-coder:14b',
      },
    })

    expect(result.isCustomProvider).toBe(true)
    expect(result.isChatGptOAuth).toBe(false)
    expect(typeof result.model).not.toBe('string')
    if (typeof result.model === 'string') {
      throw new Error('Expected a language model instance')
    }
    expect(result.model.provider).toBe('custom-local')
    expect(result.model.modelId).toBe('qwen2.5-coder:14b')
  })

  test('sends requests to the configured endpoint with auth and custom headers', async () => {
    const { generateText } = await import('ai')
    const { getModelForRequest } = await import('../impl/model-provider')
    const originalFetch = globalThis.fetch
    let capturedUrl = ''
    let capturedHeaders = new Headers()
    let capturedBody: Record<string, unknown> = {}

    globalThis.fetch = (async (input, init) => {
      capturedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      capturedHeaders = new Headers(init?.headers)
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: 'coder-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'respuesta local' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 2,
            total_tokens: 4,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof globalThis.fetch

    try {
      const result = await getModelForRequest({
        apiKey: 'unused-local-key',
        model: 'ignored/original-model',
        customProvider: {
          id: 'hosted',
          name: 'Hosted',
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-secret',
          modelId: 'coder-model',
          headers: { 'X-Tenant': 'demo' },
        },
      })
      const response = await generateText({
        model: result.model,
        prompt: 'hola',
      })

      expect(response.text).toBe('respuesta local')
      expect(capturedUrl).toBe(
        'https://models.example.test/v1/chat/completions',
      )
      expect(capturedHeaders.get('authorization')).toBe(
        'Bearer provider-secret',
      )
      expect(capturedHeaders.get('x-tenant')).toBe('demo')
      expect(capturedBody.model).toBe('coder-model')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('serializes circular tool history on a later streaming custom-provider request', async () => {
    const { streamText } = await import('ai')
    const { convertCbToModelMessages } =
      await import('@codebuff/common/util/messages')
    const { getModelForRequest } = await import('../impl/model-provider')
    const originalFetch = globalThis.fetch
    let capturedBody: Record<string, any> = {}

    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, any>
      const streamBody = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-followup',
          created: 2,
          model: 'coder-model',
          choices: [
            {
              delta: {
                role: 'assistant',
                content: 'continuación correcta',
              },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-followup',
          created: 2,
          model: 'coder-model',
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 2,
            total_tokens: 10,
          },
        })}`,
        'data: [DONE]',
        '',
      ].join('\n\n')

      return new Response(streamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof globalThis.fetch

    const circularInput: Record<string, unknown> = { path: 'src/index.ts' }
    circularInput.self = circularInput
    const circularOutput: Record<string, unknown> = { ok: true }
    circularOutput.self = circularOutput

    try {
      const result = await getModelForRequest({
        apiKey: 'unused-local-key',
        model: 'ignored/original-model',
        customProvider: {
          id: 'hosted',
          name: 'Hosted',
          baseUrl: 'https://models.example.test/v1',
          modelId: 'coder-model',
        },
      })

      const response = streamText({
        model: result.model,
        messages: convertCbToModelMessages({
          includeCacheControl: false,
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'read_files',
                  input: circularInput,
                },
              ],
            },
            {
              role: 'tool',
              toolCallId: 'call-1',
              toolName: 'read_files',
              content: [{ type: 'json', value: circularOutput }],
            },
          ] as any,
        }),
      })

      expect(await response.text).toBe('continuación correcta')
      expect(capturedBody.stream).toBe(true)
      const messages = capturedBody.messages as Array<Record<string, any>>
      expect(messages[0]?.content).toBe(' ')
      expect(messages[0]?.tool_calls?.[0]?.function?.arguments).toBe(
        JSON.stringify({ path: 'src/index.ts', self: '[Circular]' }),
      )
      expect(messages[1]?.content).toBe(
        JSON.stringify({ ok: true, self: '[Circular]' }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})


describe('Internet-aware provider transport', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  test('does not use a hidden backend when no direct provider is configured', async () => {
    const { getModelForRequest } = await import('../impl/model-provider')

    await expect(
      getModelForRequest({
        apiKey: 'legacy-key-that-must-not-be-used',
        model: 'anthropic/claude-sonnet-4',
        skipChatGptOAuth: true,
      }),
    ).rejects.toThrow('No hay un proveedor directo configurado')
  })

  test('classifies a provider transport failure separately when public Internet is reachable', async () => {
    globalThis.fetch = (async () => new Response('', { status: 204 })) as unknown as typeof fetch
    const providerFetch = async () => {
      const error = new Error('provider connection refused') as Error & { code: string }
      error.code = 'ECONNREFUSED'
      throw error
    }

    const wrapped = createInternetRecoveryFetch(providerFetch as unknown as typeof fetch)

    try {
      await wrapped('https://provider.example.test/v1/chat/completions')
      throw new Error('Expected provider transport failure')
    } catch (error) {
      expect((error as { isRetryable?: boolean }).isRetryable).toBe(true)
      expect(String((error as Error).message)).toContain('provider connection refused')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('waits for real Internet recovery and retries the same provider request', async () => {
    let providerAttempts = 0
    const providerFetch = async () => {
      providerAttempts += 1
      if (providerAttempts === 1) {
        const error = new Error('network unreachable') as Error & { code: string }
        error.code = 'ENETUNREACH'
        throw error
      }
      return new Response('ok', { status: 200 })
    }

    let probeCalls = 0
    globalThis.fetch = (async () => {
      probeCalls += 1
      // The first connectivity check launches the four configured probes.
      // The immediate check performed by waitForInternetConnection succeeds.
      if (probeCalls <= 4) throw new Error('offline')
      return new Response('', { status: 204 })
    }) as unknown as typeof fetch

    try {
      const wrapped = createInternetRecoveryFetch(providerFetch as unknown as typeof fetch)
      const response = await wrapped('https://provider.example.test/v1/chat/completions')

      expect(response.status).toBe(200)
      expect(providerAttempts).toBe(2)
      expect(probeCalls).toBeGreaterThan(4)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('does not reinterpret provider HTTP responses as an Internet outage', async () => {
    let probes = 0
    globalThis.fetch = (async () => {
      probes += 1
      return new Response('', { status: 204 })
    }) as unknown as typeof fetch
    const providerFetch = async () => new Response('rate limited', { status: 429 })

    try {
      const wrapped = createInternetRecoveryFetch(providerFetch as unknown as typeof fetch)
      const response = await wrapped('https://provider.example.test/v1/chat/completions')
      expect(response.status).toBe(429)
      expect(probes).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
