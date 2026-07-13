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
})
