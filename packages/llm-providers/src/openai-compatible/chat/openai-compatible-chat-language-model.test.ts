import { describe, expect, test } from 'bun:test'

import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model'

const createSseResponse = (payloads: unknown[]) =>
  new Response(
    `${payloads
      .map((value) => `data: ${JSON.stringify(value)}\n\n`)
      .join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )

const createToolCallChunk = (params: {
  toolCallIndex: number
  toolCallId: string
  includeRole?: boolean
}) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'test-model',
  choices: [
    {
      index: 0,
      delta: {
        ...(params.includeRole ? { role: 'assistant' } : {}),
        tool_calls: [
          {
            index: params.toolCallIndex,
            id: params.toolCallId,
            type: 'function',
            function: {
              name: 'spawn_agents',
              arguments:
                '{"agents":[{"agent_type":"researcher-web","prompt":"Find PHP"}]}',
            },
          },
        ],
      },
      finish_reason: null,
    },
  ],
})

describe('OpenAI-compatible streaming tool calls', () => {
  test('emits one tool call when a gateway replays the same id at another index', async () => {
    const response = createSseResponse([
      createToolCallChunk({
        toolCallIndex: 0,
        toolCallId: 'call-1',
        includeRole: true,
      }),
      createToolCallChunk({ toolCallIndex: 1, toolCallId: 'call-1' }),
      {
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'test-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      },
    ])
    const model = new OpenAICompatibleChatLanguageModel('test-model', {
      provider: 'test',
      headers: () => ({}),
      url: () => 'https://example.test/chat/completions',
      fetch: (async () => response) as unknown as typeof fetch,
    })

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
    })
    const parts = []
    const reader = result.stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      parts.push(value)
    }

    expect(parts.filter((part) => part.type === 'tool-call')).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'spawn_agents',
      }),
    ])
  })
})
