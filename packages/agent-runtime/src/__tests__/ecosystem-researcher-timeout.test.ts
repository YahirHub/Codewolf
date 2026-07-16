import { describe, expect, test } from 'bun:test'

import { getSubagentTimeoutMs } from '../tools/handlers/tool/spawn-agent-utils'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'

function agentTemplate(id: string): AgentTemplate {
  return { id } as AgentTemplate
}

describe('ecosystem researcher timeout', () => {
  test('allows focused official package research more time than web search but less than general agents', () => {
    expect(getSubagentTimeoutMs(agentTemplate('researcher-web'))).toBe(120_000)
    expect(getSubagentTimeoutMs(agentTemplate('ecosystem-researcher'))).toBe(
      180_000,
    )
    expect(getSubagentTimeoutMs(agentTemplate('agent'))).toBe(10 * 60_000)
  })
})
