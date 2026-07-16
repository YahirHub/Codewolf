import { describe, expect, test } from 'bun:test'

import {
  buildEffectiveAgentPrompt,
  isManualCompactPrompt,
} from '../internal-control-prompts'

describe('internal control prompts', () => {
  test('recognizes manual compaction with or without slash', () => {
    expect(isManualCompactPrompt('/compact')).toBe(true)
    expect(isManualCompactPrompt(' COMPACT ')).toBe(true)
    expect(isManualCompactPrompt('/compact now')).toBe(false)
    expect(isManualCompactPrompt('please compact')).toBe(false)
  })

  test('keeps /compact exact even when project and transient context exist', () => {
    expect(
      buildEffectiveAgentPrompt({
        rawContent: '/compact',
        promptWithTransientContext:
          '[Terminal output]\ncommand result\n\n/compact',
        hasMessageContent: true,
        projectContextEnabled: true,
        projectContextInstruction: 'Always read contexto/.',
      }),
    ).toBe('/compact')
  })

  test('injects project context into ordinary prompts', () => {
    expect(
      buildEffectiveAgentPrompt({
        rawContent: 'Corrige el error',
        promptWithTransientContext: 'Corrige el error',
        hasMessageContent: false,
        projectContextEnabled: true,
        projectContextInstruction: 'Always read contexto/.',
      }),
    ).toBe('Always read contexto/.\n\nCorrige el error')
  })

  test('keeps ordinary prompts unchanged when project context is disabled', () => {
    expect(
      buildEffectiveAgentPrompt({
        rawContent: 'Hola',
        promptWithTransientContext: 'Hola',
        hasMessageContent: false,
        projectContextEnabled: false,
        projectContextInstruction: 'ignored',
      }),
    ).toBe('Hola')
  })
})
