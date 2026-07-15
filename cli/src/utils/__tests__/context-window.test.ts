import { describe, expect, test } from 'bun:test'

import {
  formatContextTokens,
  getContextWindowProgress,
  getRunStateContextTokenCount,
} from '../context-window'

import type { RunState } from '@codebuff/sdk'

describe('context window status helpers', () => {
  test('reads the main-agent context count from a run state', () => {
    const runState = {
      traceSessionId: 'trace',
      output: { type: 'lastMessage', value: [] },
      sessionState: {
        mainAgentState: { contextTokenCount: 123_456 },
      },
    } as unknown as RunState

    expect(getRunStateContextTokenCount(runState)).toBe(123_456)
    expect(getRunStateContextTokenCount(null)).toBe(0)
  })

  test('calculates a draining remaining-capacity fraction', () => {
    const progress = getContextWindowProgress(900_000, 1_000_000)

    expect(progress).not.toBeNull()
    expect(progress?.usedPercent).toBe(90)
    expect(progress?.remainingPercent).toBe(10)
    expect(progress?.remainingFraction).toBeCloseTo(0.1)
    expect(progress?.level).toBe('critical')
  })

  test('classifies warning and normal ranges', () => {
    expect(getContextWindowProgress(749_999, 1_000_000)?.level).toBe('normal')
    expect(getContextWindowProgress(750_000, 1_000_000)?.level).toBe('warning')
  })

  test('clamps over-capacity values and rejects invalid limits', () => {
    expect(getContextWindowProgress(2_000, 1_000)?.usedPercent).toBe(100)
    expect(getContextWindowProgress(100, 0)).toBeNull()
  })

  test('formats compact token labels', () => {
    expect(formatContextTokens(999)).toBe('999')
    expect(formatContextTokens(1_500)).toBe('1.5k')
    expect(formatContextTokens(250_000)).toBe('250k')
    expect(formatContextTokens(1_000_000)).toBe('1M')
  })
})
