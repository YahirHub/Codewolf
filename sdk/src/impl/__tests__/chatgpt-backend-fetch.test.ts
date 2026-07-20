import { describe, expect, test } from 'bun:test'

import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
  transformChatGptRequestBody,
} from '../chatgpt-backend-fetch'

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  )
}

function jwtWithPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

function neverStreamingResponse(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start() {
        // Intentionally never emits or closes.
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  )
}

const terminalEvents = [
  {
    type: 'response.created',
    response: { id: 'resp_1', model: 'gpt-5.4' },
  },
  { type: 'response.output_text.delta', delta: 'ok' },
  {
    type: 'response.completed',
    response: {
      id: 'resp_1',
      model: 'gpt-5.4',
      status: 'completed',
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    },
  },
]

describe('ChatGPT Codex backend transport', () => {
  test('builds a Codex Responses payload with cache affinity and responsive defaults', () => {
    const body = transformChatGptRequestBody(
      {
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'hello' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read a file',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      },
      { sessionId: 'session-123' },
    )

    expect(body.store).toBe(false)
    expect(body.stream).toBe(true)
    expect(body.prompt_cache_key).toBe('session-123')
    expect(body.parallel_tool_calls).toBe(true)
    expect(body.tool_choice).toBe('auto')
    expect(body.text).toEqual({ verbosity: 'low' })
    expect(body.include).toEqual(['reasoning.encrypted_content'])
  })

  test('retries when Codex opens HTTP but never emits the first SSE event', async () => {
    let calls = 0
    const mockFetch = async () => {
      calls++
      return calls === 1 ? neverStreamingResponse() : sseResponse(terminalEvents)
    }

    const fetchFn = createChatGptBackendFetch({
      fetch: mockFetch,
      firstEventTimeoutMs: 10,
      headerTimeoutMs: 100,
      streamIdleTimeoutMs: 100,
      startupRetries: 1,
    })

    const response = await fetchFn('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
    })
    const text = await response.text()

    expect(calls).toBe(2)
    expect(text).toContain('"content":"ok"')
    expect(text).toContain('data: [DONE]')
  })

  test('retries transient Codex 503 responses before streaming', async () => {
    let calls = 0
    const mockFetch = async () => {
      calls++
      if (calls === 1) return new Response('busy', { status: 503 })
      return sseResponse(terminalEvents)
    }

    const fetchFn = createChatGptBackendFetch({
      fetch: mockFetch,
      firstEventTimeoutMs: 100,
      headerTimeoutMs: 100,
      streamIdleTimeoutMs: 100,
      startupRetries: 1,
    })

    const response = await fetchFn('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
    })

    expect(response.status).toBe(200)
    expect(calls).toBe(2)
    expect(await response.text()).toContain('data: [DONE]')
  })

  test('surfaces truncated SSE streams instead of silently swallowing the error', async () => {
    const fetchFn = createChatGptBackendFetch({
      fetch: async () =>
        sseResponse([
          {
            type: 'response.created',
            response: { id: 'resp_truncated', model: 'gpt-5.4' },
          },
          { type: 'response.output_text.delta', delta: 'partial' },
        ]),
      firstEventTimeoutMs: 100,
      headerTimeoutMs: 100,
      streamIdleTimeoutMs: 100,
      startupRetries: 0,
    })

    const response = await fetchFn('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
    })

    await expect(response.text()).rejects.toThrow(
      'terminó antes de recibir response.completed',
    )
  })

  test('extracts ChatGPT account ids from current Codex JWT claim shapes', () => {
    expect(
      extractChatGptAccountId(
        jwtWithPayload({ chatgpt_account_id: 'acct_top_level' }),
      ),
    ).toBe('acct_top_level')
    expect(
      extractChatGptAccountId(
        jwtWithPayload({
          'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_nested',
          },
        }),
      ),
    ).toBe('acct_nested')
    expect(
      extractChatGptAccountId(
        jwtWithPayload({ organizations: [{ id: 'org_fallback' }] }),
      ),
    ).toBe('org_fallback')
  })

  test('fails a stream that becomes idle instead of hanging indefinitely', async () => {
    const encoder = new TextEncoder()
    const fetchFn = createChatGptBackendFetch({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'response.created',
                    response: { id: 'resp_idle', model: 'gpt-5.4' },
                  })}\n\n`,
                ),
              )
              // Intentionally leave the stream open and silent.
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        ),
      firstEventTimeoutMs: 100,
      headerTimeoutMs: 100,
      streamIdleTimeoutMs: 10,
      startupRetries: 0,
    })

    const response = await fetchFn(
      'https://chatgpt.com/backend-api/codex/responses',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
      },
    )

    await expect(response.text()).rejects.toThrow(
      'La conexión Codex no recibió datos',
    )
  })

  test('emits a single completion marker when Codex sends duplicate terminal events', async () => {
    const fetchFn = createChatGptBackendFetch({
      fetch: async () =>
        sseResponse([
          ...terminalEvents,
          {
            type: 'response.done',
            response: { id: 'resp_1', model: 'gpt-5.4', status: 'completed' },
          },
        ]),
      firstEventTimeoutMs: 100,
      headerTimeoutMs: 100,
      streamIdleTimeoutMs: 100,
      startupRetries: 0,
    })

    const response = await fetchFn(
      'https://chatgpt.com/backend-api/codex/responses',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
      },
    )
    const text = await response.text()
    expect(text.match(/data: \[DONE\]/g)?.length).toBe(1)
  })
})
