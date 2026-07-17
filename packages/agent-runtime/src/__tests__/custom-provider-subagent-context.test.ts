import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { describe, expect, it } from 'bun:test'

import { mockFileContext } from './test-utils'
import {
  extractSubagentContextParams,
  resolveSubagentProviderContext,
} from '../tools/handlers/tool/spawn-agent-utils'

import type {
  CustomProviderRuntimeConfig,
  ExplorationProviderOverrides,
} from '@codebuff/common/types/custom-provider'
import type { TraceWriter } from '@codebuff/common/types/contracts/trace'

describe('custom provider subagent context', () => {
  it('propagates the active custom provider and trace writer to spawned agents', () => {
    const customProvider: CustomProviderRuntimeConfig = {
      id: 'local-provider',
      name: 'Local Provider',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKey: 'secret',
      modelId: 'local-model',
    }
    const traceWriter: TraceWriter = {
      recordStep: () => {},
    }

    const context = extractSubagentContextParams({
      ...TEST_AGENT_RUNTIME_IMPL,
      customProvider,
      traceWriter,
      clientSessionId: 'session',
      costMode: 'normal',
      extraCodebuffMetadata: { source: 'cli' },
      fileContext: mockFileContext,
      localAgentTemplates: {},
      repoId: undefined,
      repoUrl: undefined,
      signal: new AbortController().signal,
      userId: 'user',
    })

    expect(context.customProvider).toBe(customProvider)
    expect(context.traceWriter).toBe(traceWriter)
    expect(context.apiKey).toBe(TEST_AGENT_RUNTIME_IMPL.apiKey)
  })

  it('uses a dedicated provider only for the configured research agent', () => {
    const parentProvider: CustomProviderRuntimeConfig = {
      id: 'main-provider',
      name: 'Main Provider',
      baseUrl: 'https://main.example/v1',
      apiKey: 'main-secret',
      modelId: 'main-model',
    }
    const cheapProvider: CustomProviderRuntimeConfig = {
      id: 'cheap-provider',
      name: 'Cheap Provider',
      baseUrl: 'https://cheap.example/v1',
      apiKey: 'cheap-secret',
      modelId: 'cheap-model',
    }

    expect(
      resolveSubagentProviderContext({
        agentId: 'ecosystem-researcher',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        researchProviders: {
          'ecosystem-researcher': cheapProvider,
        },
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:cheap-provider',
      customProvider: cheapProvider,
      usesDedicatedProvider: true,
    })

    expect(
      resolveSubagentProviderContext({
        agentId: 'code-reviewer',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        researchProviders: {
          'ecosystem-researcher': cheapProvider,
        },
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:main-provider',
      customProvider: parentProvider,
      usesDedicatedProvider: false,
    })
  })

  it('uses the configured code-reviewer provider before OPUS and /models', () => {
    const parentProvider: CustomProviderRuntimeConfig = {
      id: 'active-provider',
      name: 'Active Provider',
      baseUrl: 'https://active.example/v1',
      apiKey: 'active-secret',
      modelId: 'active-model',
    }
    const opusProvider: CustomProviderRuntimeConfig = {
      id: 'power-provider',
      name: 'Power Provider',
      baseUrl: 'https://power.example/v1',
      apiKey: 'power-secret',
      modelId: 'power-model',
    }
    const codeReviewerProvider: CustomProviderRuntimeConfig = {
      id: 'review-provider',
      name: 'Review Provider',
      baseUrl: 'https://review.example/v1',
      apiKey: 'review-secret',
      modelId: 'review-model',
    }

    for (const agentId of [
      'code-reviewer',
      'code-reviewer-opus',
      'code-reviewer-lite',
      'code-reviewer-multi-prompt',
      'reviewer',
    ]) {
      expect(
        resolveSubagentProviderContext({
          agentId,
          agentModel: 'anthropic/claude-opus-4.8',
          apiKey: 'parent-api-key',
          customProvider: parentProvider,
          opusProvider,
          codeReviewerProvider,
        }),
      ).toEqual({
        apiKey: 'local-custom-provider:review-provider',
        customProvider: codeReviewerProvider,
        usesDedicatedProvider: true,
      })
    }

    expect(
      resolveSubagentProviderContext({
        agentId: 'thinker',
        agentModel: 'anthropic/claude-opus-4.8',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        opusProvider,
        codeReviewerProvider,
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:power-provider',
      customProvider: opusProvider,
      usesDedicatedProvider: true,
    })
  })

  it('routes code-searcher, file-picker, and file-lister through their configured models', () => {
    const sessionProvider: CustomProviderRuntimeConfig = {
      id: 'session-provider',
      name: 'Session Provider',
      baseUrl: 'https://session.example/v1',
      apiKey: 'session-secret',
      modelId: 'session-model',
    }
    const searchProvider: CustomProviderRuntimeConfig = {
      id: 'search-provider',
      name: 'Search Provider',
      baseUrl: 'https://search.example/v1',
      apiKey: 'search-secret',
      modelId: 'search-model',
    }
    const pickerProvider: CustomProviderRuntimeConfig = {
      id: 'picker-provider',
      name: 'Picker Provider',
      baseUrl: 'https://picker.example/v1',
      apiKey: 'picker-secret',
      modelId: 'picker-model',
    }
    const listerProvider: CustomProviderRuntimeConfig = {
      id: 'lister-provider',
      name: 'Lister Provider',
      baseUrl: 'https://lister.example/v1',
      apiKey: 'lister-secret',
      modelId: 'lister-model',
    }
    const explorationProviders: ExplorationProviderOverrides = {
      'code-searcher': searchProvider,
      'file-picker': pickerProvider,
      'file-lister': listerProvider,
    }

    for (const [agentId, expected] of [
      ['code-searcher', searchProvider],
      ['file-picker', pickerProvider],
      ['file-picker-max', pickerProvider],
      ['file-lister', listerProvider],
      ['file-lister-max', listerProvider],
    ] as const) {
      expect(
        resolveSubagentProviderContext({
          agentId,
          apiKey: 'parent-api-key',
          customProvider: sessionProvider,
          sessionProvider,
          explorationProviders,
        }),
      ).toEqual({
        apiKey: `local-custom-provider:${expected.id}`,
        customProvider: expected,
        usesDedicatedProvider: true,
      })
    }
  })

  it('lets exploration agents inherit /models instead of the OPUS preference', () => {
    const sessionProvider: CustomProviderRuntimeConfig = {
      id: 'session-provider',
      name: 'Session Provider',
      baseUrl: 'https://session.example/v1',
      apiKey: 'session-secret',
      modelId: 'session-model',
    }
    const opusProvider: CustomProviderRuntimeConfig = {
      id: 'opus-provider',
      name: 'OPUS Provider',
      baseUrl: 'https://opus.example/v1',
      apiKey: 'opus-secret',
      modelId: 'opus-model',
    }

    expect(
      resolveSubagentProviderContext({
        agentId: 'file-picker-max',
        agentModel: 'anthropic/claude-opus-4.8',
        apiKey: 'parent-api-key',
        customProvider: sessionProvider,
        sessionProvider,
        opusProvider,
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:session-provider',
      customProvider: sessionProvider,
      usesDedicatedProvider: false,
    })
  })

  it('restores the session model for an unconfigured nested exploration agent', () => {
    const sessionProvider: CustomProviderRuntimeConfig = {
      id: 'session-provider',
      name: 'Session Provider',
      baseUrl: 'https://session.example/v1',
      apiKey: 'session-secret',
      modelId: 'session-model',
    }
    const pickerProvider: CustomProviderRuntimeConfig = {
      id: 'picker-provider',
      name: 'Picker Provider',
      baseUrl: 'https://picker.example/v1',
      apiKey: 'picker-secret',
      modelId: 'picker-model',
    }

    expect(
      resolveSubagentProviderContext({
        agentId: 'file-lister',
        apiKey: 'parent-api-key',
        customProvider: pickerProvider,
        sessionProvider,
        explorationProviders: { 'file-picker': pickerProvider },
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:session-provider',
      customProvider: sessionProvider,
      usesDedicatedProvider: true,
    })
  })

  it('uses the configured OPUS provider for OPUS-class agents and otherwise inherits /models', () => {
    const parentProvider: CustomProviderRuntimeConfig = {
      id: 'active-provider',
      name: 'Active Provider',
      baseUrl: 'https://active.example/v1',
      apiKey: 'active-secret',
      modelId: 'active-model',
    }
    const opusProvider: CustomProviderRuntimeConfig = {
      id: 'power-provider',
      name: 'Power Provider',
      baseUrl: 'https://power.example/v1',
      apiKey: 'power-secret',
      modelId: 'power-model',
    }

    expect(
      resolveSubagentProviderContext({
        agentId: 'thinker',
        agentModel: 'anthropic/claude-opus-4.8',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        opusProvider,
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:power-provider',
      customProvider: opusProvider,
      usesDedicatedProvider: true,
    })

    expect(
      resolveSubagentProviderContext({
        agentId: 'code-reviewer-opus',
        agentModel: 'openai/gpt-5.4',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        opusProvider,
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:power-provider',
      customProvider: opusProvider,
      usesDedicatedProvider: true,
    })

    expect(
      resolveSubagentProviderContext({
        agentId: 'basher',
        agentModel: 'openai/gpt-5.4',
        apiKey: 'parent-api-key',
        customProvider: parentProvider,
        opusProvider,
      }),
    ).toEqual({
      apiKey: 'local-custom-provider:active-provider',
      customProvider: parentProvider,
      usesDedicatedProvider: false,
    })
  })
})
