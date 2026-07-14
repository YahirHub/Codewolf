import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import { describe, expect, test } from 'bun:test'

import { applyOverridesToSessionState, withMessageHistory } from '../run-state'

function sessionWithCircularToolSchema() {
  const session = getInitialSessionState(getStubProjectFileContext())
  const schema: Record<string, unknown> = { type: 'object' }
  schema.self = schema
  session.mainAgentState.toolDefinitions = {
    write_file: {
      description: 'Write a file',
      inputSchema: schema,
    },
  }
  return session
}

describe('continuing sessions with legacy cyclic tool definitions', () => {
  test('applyOverridesToSessionState does not fail on the second turn', async () => {
    const source = sessionWithCircularToolSchema()

    const nextTurn = await applyOverridesToSessionState(undefined, source, {})

    expect(
      nextTurn.mainAgentState.toolDefinitions.write_file?.inputSchema,
    ).toEqual({
      type: 'object',
      self: '[Circular]',
    })
    expect(() => JSON.stringify(nextTurn)).not.toThrow()
  })

  test('withMessageHistory also returns a persistable run state', () => {
    const source = sessionWithCircularToolSchema()
    const result = withMessageHistory({
      runState: {
        sessionState: source,
        traceSessionId: 'trace-1',
        output: { type: 'error', message: 'test' },
      },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'second message' }],
        } as any,
      ],
    })

    expect(() => JSON.stringify(result)).not.toThrow()
    expect(result.sessionState?.mainAgentState.messageHistory).toHaveLength(1)
  })

  test('repairs malformed persisted messages before continuing a session', async () => {
    const source = sessionWithCircularToolSchema()
    source.mainAgentState.messageHistory = [
      { role: 'assistant', content: null },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['src/index.ts'] },
          },
        ],
      },
      {
        role: null,
        toolCallId: 'call-1',
        toolName: 'read_files',
        content: null,
      },
      { role: 'user', content: 'Continue' },
    ] as any

    const nextTurn = await applyOverridesToSessionState(undefined, source, {})

    expect(nextTurn.mainAgentState.messageHistory).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['src/index.ts'] },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        toolName: 'read_files',
        content: [],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Continue' }],
      },
    ])
  })
})
