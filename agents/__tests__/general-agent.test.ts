import { describe, expect, test } from 'bun:test'

import agent from '../general-agent/agent'

describe('generic agent', () => {
  test('uses a model-neutral public identity', () => {
    expect(agent.id).toBe('agent')
    expect(agent.displayName).toBe('Agent')
    expect(agent.displayName.toLowerCase()).not.toContain('gpt')
  })

  test('keeps a backend fallback while allowing the active custom provider to override it', () => {
    expect(agent.model).toBe('openai/gpt-5.4')
  })
})
