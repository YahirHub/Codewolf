import { describe, expect, it } from 'bun:test'

import {
  getAgentStreamFromTemplate,
  MAX_PROVIDER_REQUEST_ATTEMPTS,
  MAX_PROVIDER_REQUEST_RETRIES,
} from '../prompt-agent-stream'

import type { AgentTemplate } from '../templates/types'
import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'

describe('provider request retries', () => {
  it('allows five total attempts for each model turn', () => {
    let capturedMaxRetries: number | undefined

    const promptAiSdkStream = ((params: { maxRetries?: number }) => {
      capturedMaxRetries = params.maxRetries
      return {} as ReturnType<PromptAiSdkStreamFn>
    }) as PromptAiSdkStreamFn

    getAgentStreamFromTemplate({
      apiKey: 'test-key',
      clientSessionId: 'session',
      fingerprintId: 'fingerprint',
      localAgentTemplates: {},
      logger: {} as never,
      messages: [],
      runId: 'run',
      signal: new AbortController().signal,
      template: {
        id: 'test-agent',
        model: 'openai/gpt-5.4',
        spawnableAgents: [],
      } as unknown as AgentTemplate,
      tools: {},
      userId: 'user',
      userInputId: 'input',
      promptAiSdkStream,
      sendAction: (() => {}) as never,
      trackEvent: (() => {}) as never,
    })

    expect(MAX_PROVIDER_REQUEST_ATTEMPTS).toBe(5)
    expect(MAX_PROVIDER_REQUEST_RETRIES).toBe(4)
    expect(capturedMaxRetries).toBe(4)
  })
})
