import { afterEach, describe, expect, test } from 'bun:test'

import { OpenAICompatibleChatLanguageModel } from '../openai-compatible-chat-language-model'

describe('OpenAI-compatible non-streaming transport', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('converts one JSON completion into stream events with text and tools', async () => {
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({
        id: 'chatcmpl-nvidia',
        model: 'deepseek-ai/deepseek-v4-pro',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Voy a revisar el archivo.',
              tool_calls: [
                {
                  id: 'call-1',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"README.md"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 7,
          total_tokens: 17,
        },
      })
    }) as unknown as typeof fetch

    const model = new OpenAICompatibleChatLanguageModel(
      'deepseek-ai/deepseek-v4-pro',
      {
        provider: 'custom-nvidia-nim',
        url: ({ path }) => `https://integrate.api.nvidia.com/v1${path}`,
        headers: () => ({ Authorization: 'Bearer secret' }),
        fetch: globalThis.fetch,
        useNonStreamingForDoStream: true,
      },
    )

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Revisa' }] }],
      tools: [
        {
          type: 'function',
          name: 'read_file',
          description: 'Lee un archivo',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ],
    } as never)

    const events: Array<Record<string, unknown>> = []
    const reader = result.stream.getReader()
    while (true) {
      const next = await reader.read()
      if (next.done) break
      events.push(next.value as unknown as Record<string, unknown>)
    }

    expect(requestBody?.stream).toBeUndefined()
    expect(events.map((event) => event.type)).toEqual([
      'stream-start',
      'response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'finish',
    ])
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: 'tool-calls',
      usage: {
        inputTokens: 10,
        outputTokens: 7,
        totalTokens: 17,
      },
    })
  })
})
