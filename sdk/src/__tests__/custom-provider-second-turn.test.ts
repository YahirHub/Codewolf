import * as mainPromptModule from '@codebuff/agent-runtime/main-prompt'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { CodebuffClient } from '../client'

describe('custom provider multi-turn session serialization', () => {
  afterEach(() => {
    mock.restore()
  })

  test('a second prompt survives tool schemas that were cyclic in the first turn', async () => {
    let invocation = 0

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        invocation++
        expect(params.action.promptParams).toEqual({
          maxContextLength: 900_000,
        })
        const state = params.action.sessionState

        if (invocation === 1) {
          const cyclicSchema: Record<string, unknown> = { type: 'object' }
          cyclicSchema.self = cyclicSchema

          state.mainAgentState.toolDefinitions = {
            write_file: {
              description: 'Write a file',
              inputSchema: cyclicSchema,
            },
          }
          state.mainAgentState.messageHistory = [
            userMessage('¿Qué eres?'),
            assistantMessage('Soy un asistente de programación.'),
          ]
        } else {
          expect(
            state.mainAgentState.toolDefinitions.write_file?.inputSchema,
          ).toEqual({ type: 'object', self: '[Circular]' })
          state.mainAgentState.messageHistory = [
            ...state.mainAgentState.messageHistory,
            userMessage(
              'Crea una carpeta llamada pruebas y dentro un servidor JavaScript.',
            ),
            assistantMessage('Voy a crear los archivos solicitados.'),
          ]
        }

        await params.sendAction({
          action: {
            type: 'prompt-response',
            promptId: params.promptId,
            sessionState: state,
            output: { type: 'lastMessage', value: [] },
          },
        })

        return {
          sessionState: state,
          output: { type: 'lastMessage' as const, value: [] },
        }
      },
    )

    const client = new CodebuffClient({
      apiKey: 'unused-custom-provider-key',
      customProvider: {
        id: 'local',
        name: 'Local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'coder-model',
        maxContextTokens: 1_000_000,
      },
    })

    const first = await client.run({
      agent: 'base2',
      prompt: '¿Qué eres?',
    })

    expect(first.output.type).toBe('lastMessage')
    expect(() => JSON.stringify(first)).not.toThrow()

    const second = await client.run({
      agent: 'base2',
      prompt:
        'Crea una carpeta llamada pruebas y dentro crea un archivo JavaScript.',
      previousRun: first,
    })

    expect(second.output.type).toBe('lastMessage')
    expect(invocation).toBe(2)
    expect(() => JSON.stringify(second)).not.toThrow()
    expect(second.sessionState?.mainAgentState.messageHistory).toHaveLength(4)
  })
})
