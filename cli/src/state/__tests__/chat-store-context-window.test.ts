import { beforeEach, describe, expect, test } from 'bun:test'

import { useChatStore } from '../chat-store'

import type { RunState } from '@codebuff/sdk'

const runStateWithContext = (tokens: number) =>
  ({
    traceSessionId: 'trace',
    output: { type: 'lastMessage', value: [] },
    sessionState: {
      mainAgentState: { contextTokenCount: tokens },
    },
  }) as unknown as RunState

describe('chat context window state', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  test('tracks context when a run state is loaded or completed', () => {
    useChatStore.getState().setRunState(runStateWithContext(42_000))
    expect(useChatStore.getState().contextTokenCount).toBe(42_000)
  })

  test('accepts in-flight snapshot updates and normalizes invalid values', () => {
    useChatStore.getState().setContextTokenCount(55_555.4)
    expect(useChatStore.getState().contextTokenCount).toBe(55_555)

    useChatStore.getState().setContextTokenCount(Number.NaN)
    expect(useChatStore.getState().contextTokenCount).toBe(0)
  })

  test('clears the meter with the chat run state', () => {
    useChatStore.getState().setRunState(runStateWithContext(80_000))
    useChatStore.getState().setRunState(null)
    expect(useChatStore.getState().contextTokenCount).toBe(0)
  })
})
