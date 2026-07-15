import * as mainPromptModule from '@codebuff/agent-runtime/main-prompt'
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { CodebuffClient } from '../client'

describe('additional and excluded knowledge files', () => {
  afterEach(() => {
    mock.restore()
  })

  test('updates virtual knowledge and removes disabled paths on a continued session', async () => {
    let invocation = 0

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        invocation += 1
        const knowledge = params.action.sessionState.fileContext.knowledgeFiles

        if (invocation === 1) {
          expect(knowledge['AGENTS.md']).toBe('base rules')
          expect(knowledge['.codewolf/contexto-resumen.md']).toBe('summary v1')
        } else {
          expect(knowledge['AGENTS.md']).toBeUndefined()
          expect(knowledge['.codewolf/contexto-resumen.md']).toBe('summary v2')
        }

        await params.sendAction({
          action: {
            type: 'prompt-response',
            promptId: params.promptId,
            sessionState: params.action.sessionState,
            output: { type: 'lastMessage', value: [] },
          },
        })

        return {
          sessionState: params.action.sessionState,
          output: { type: 'lastMessage' as const, value: [] },
        }
      },
    )

    const client = new CodebuffClient({
      apiKey: 'unused-test-key',
      customProvider: {
        id: 'local',
        name: 'Local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'coder-model',
      },
    })

    const first = await client.run({
      agent: 'base2',
      prompt: 'Primer turno',
      projectFiles: {},
      knowledgeFiles: { 'AGENTS.md': 'base rules' },
      additionalKnowledgeFiles: {
        '.codewolf/contexto-resumen.md': 'summary v1',
      },
    })

    const second = await client.run({
      agent: 'base2',
      prompt: 'Segundo turno',
      previousRun: first,
      additionalKnowledgeFiles: {
        '.codewolf/contexto-resumen.md': 'summary v2',
      },
      excludedKnowledgeFilePaths: ['AGENTS.md'],
    })

    expect(second.output.type).toBe('lastMessage')
    expect(invocation).toBe(2)
  })
})
