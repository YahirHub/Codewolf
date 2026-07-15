import { describe, expect, test } from 'bun:test'

import {
  getOpenAICompatibleErrorMessage,
  isRetryableOpenAICompatibleError,
  openaiCompatibleErrorDataSchema,
} from './openai-compatible-error'

describe('OpenAI-compatible error compatibility', () => {
  test('accepts common gateway error envelopes', () => {
    expect(
      openaiCompatibleErrorDataSchema.parse({
        error: { message: 'nested failure', type: 'server_error' },
      }),
    ).toMatchObject({ error: { message: 'nested failure' } })

    expect(
      getOpenAICompatibleErrorMessage(
        openaiCompatibleErrorDataSchema.parse({
          error: 'string failure',
        }),
      ),
    ).toBe('string failure')

    expect(
      getOpenAICompatibleErrorMessage(
        openaiCompatibleErrorDataSchema.parse({
          detail: [{ msg: 'validation failed' }],
        }),
      ),
    ).toBe('validation failed')
  })

  test('retries transient status codes and generic upstream failures', () => {
    expect(
      isRetryableOpenAICompatibleError(
        new Response('{}', { status: 502 }),
        openaiCompatibleErrorDataSchema.parse({
          error: { message: 'Bad gateway' },
        }),
      ),
    ).toBe(true)

    expect(
      isRetryableOpenAICompatibleError(
        new Response('{}', { status: 400 }),
        openaiCompatibleErrorDataSchema.parse({
          message: 'Upstream request failed',
        }),
      ),
    ).toBe(true)
  })

  test('respects an explicit x-should-retry false header', () => {
    expect(
      isRetryableOpenAICompatibleError(
        new Response('{}', {
          status: 503,
          headers: { 'x-should-retry': 'false' },
        }),
        openaiCompatibleErrorDataSchema.parse({
          message: 'Service unavailable',
        }),
      ),
    ).toBe(false)
  })

  test('does not retry ordinary validation errors', () => {
    expect(
      isRetryableOpenAICompatibleError(
        new Response('{}', { status: 400 }),
        openaiCompatibleErrorDataSchema.parse({
          error: { message: 'Invalid messages payload' },
        }),
      ),
    ).toBe(false)
  })
})
