import { describe, expect, test } from 'bun:test'

import {
  buildTokenUsageEvent,
  estimateOutputTokens,
  estimateRequestTokens,
  resolveProviderIdentity,
} from '../token-usage'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const messages: Message[] = [
  { role: 'system', content: [{ type: 'text', text: 'Eres un asistente.' }] },
  { role: 'user', content: [{ type: 'text', text: 'Hola mundo' }] },
]

describe('token usage normalization', () => {
  test('uses provider values when input and output usage are available', () => {
    const event = buildTokenUsageEvent({
      runId: 'run-1',
      userInputId: 'input-1',
      providerId: 'test',
      providerName: 'Test',
      modelId: 'model',
      providerUsage: {
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        cachedInputTokens: 20,
      },
      estimatedInputTokens: 999,
      estimatedOutputTokens: 999,
      status: 'success',
      durationMs: 123,
    })

    expect(event.inputTokens).toBe(120)
    expect(event.outputTokens).toBe(30)
    expect(event.totalTokens).toBe(150)
    expect(event.cachedInputTokens).toBe(20)
    expect(event.measurement).toBe('provider')
  })

  test('calculates missing usage locally without inventing provider data', () => {
    const event = buildTokenUsageEvent({
      runId: 'run-2',
      userInputId: 'input-2',
      providerId: 'local',
      providerName: 'Local',
      modelId: 'model',
      estimatedInputTokens: 90,
      estimatedOutputTokens: 15,
      status: 'success',
      durationMs: 10,
    })

    expect(event.inputTokens).toBe(90)
    expect(event.outputTokens).toBe(15)
    expect(event.totalTokens).toBe(105)
    expect(event.measurement).toBe('local')
  })

  test('marks partially reported usage as mixed', () => {
    const event = buildTokenUsageEvent({
      runId: 'run-3',
      userInputId: 'input-3',
      providerId: 'mixed',
      providerName: 'Mixed',
      modelId: 'model',
      providerUsage: { inputTokens: 100 },
      estimatedInputTokens: 90,
      estimatedOutputTokens: 25,
      status: 'success',
      durationMs: 10,
    })

    expect(event.inputTokens).toBe(100)
    expect(event.outputTokens).toBe(25)
    expect(event.totalTokens).toBe(125)
    expect(event.measurement).toBe('mixed')
  })

  test('estimates the complete normalized request body including tools', () => {
    const estimate = estimateRequestTokens({
      messages,
      provider: 'custom-test',
      rawBody: {
        model: 'model',
        messages: [
          { role: 'system', content: 'Eres un asistente.' },
          { role: 'user', content: 'Hola mundo' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Lee un archivo',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      },
    })

    expect(estimate.tokens).toBeGreaterThan(0)
    expect(estimate.hasMultimodalContent).toBe(false)
  })

  test('does not count image base64 character by character', () => {
    const estimate = estimateRequestTokens({
      messages,
      provider: 'custom-test',
      rawBody: {
        model: 'model',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analiza esta imagen' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${'a'.repeat(100_000)}`,
                },
              },
            ],
          },
        ],
      },
    })

    expect(estimate.hasMultimodalContent).toBe(true)
    expect(estimate.tokens).toBeLessThan(10_000)
  })

  test('counts streamed text and tool calls as model output', () => {
    const tokens = estimateOutputTokens([
      'Voy a leer el archivo.',
      { toolName: 'read_file', input: { path: 'src/index.ts' } },
    ])
    expect(tokens).toBeGreaterThan(0)
  })

  test('uses the active custom provider and model identity', () => {
    expect(
      resolveProviderIdentity({
        requestedModel: 'template-model',
        provider: 'custom-local',
        customProvider: {
          id: 'local',
          name: 'Servidor local',
          baseUrl: 'http://localhost:11434/v1',
          modelId: 'qwen-coder',
        },
      }),
    ).toEqual({
      providerId: 'local',
      providerName: 'Servidor local',
      modelId: 'qwen-coder',
    })
  })
})
