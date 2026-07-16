import { describe, expect, test } from 'bun:test'

import {
  SubagentTimeoutError,
  getSubagentTimeoutMs,
} from '../tools/handlers/tool/spawn-agent-utils'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'

function agentTemplate(id: string): AgentTemplate {
  return { id } as AgentTemplate
}

describe('research subagent timeout', () => {
  test('uses a longer default ceiling for every research agent', () => {
    for (const id of [
      'researcher-web',
      'researcher-docs',
      'ecosystem-researcher',
    ]) {
      expect(getSubagentTimeoutMs(agentTemplate(id))).toBe(15 * 60_000)
    }
    expect(getSubagentTimeoutMs(agentTemplate('agent'))).toBe(10 * 60_000)
  })

  test('accepts a per-run research ceiling and clamps unsafe values', () => {
    const researcher = agentTemplate('ecosystem-researcher')
    expect(getSubagentTimeoutMs(researcher, 30 * 60_000)).toBe(30 * 60_000)
    expect(getSubagentTimeoutMs(researcher, 1)).toBe(60_000)
    expect(getSubagentTimeoutMs(researcher, 500 * 60_000)).toBe(120 * 60_000)
  })

  test('reports configured limits in minutes', () => {
    expect(
      new SubagentTimeoutError('researcher-web', 15 * 60_000).message,
    ).toContain('15 minutes')
  })
})
