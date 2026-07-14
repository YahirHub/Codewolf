import { describe, expect, test } from 'bun:test'

import { deduplicateSpawnAgentRequests } from '@codebuff/common/util/spawn-agent'

describe('deduplicateSpawnAgentRequests', () => {
  test('executes identical agents once while preserving original index mapping', () => {
    const duplicate = {
      agent_type: 'researcher-web',
      prompt: 'Find the latest PHP version',
    }
    const { uniqueAgents, originalToUniqueIndex } =
      deduplicateSpawnAgentRequests([
        duplicate,
        { ...duplicate },
        {
          agent_type: 'researcher-web',
          prompt: 'Find the latest Ubuntu version',
        },
      ] as any)

    expect(uniqueAgents).toHaveLength(2)
    expect(originalToUniqueIndex).toEqual([0, 0, 1])
  })

  test('does not collapse same agent type with different prompts', () => {
    const { uniqueAgents, originalToUniqueIndex } =
      deduplicateSpawnAgentRequests([
        {
          agent_type: 'researcher-web',
          prompt: 'Find Android',
        },
        {
          agent_type: 'researcher-web',
          prompt: 'Find PHP',
        },
      ] as any)

    expect(uniqueAgents).toHaveLength(2)
    expect(originalToUniqueIndex).toEqual([0, 1])
  })
})
