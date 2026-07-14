import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { describe, expect, it } from 'bun:test'

import { mockFileContext } from './test-utils'
import { extractSubagentContextParams } from '../tools/handlers/tool/spawn-agent-utils'

import type { CustomProviderRuntimeConfig } from '@codebuff/common/types/custom-provider'
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
})
