import { describe, expect, test } from 'bun:test'

import {
  createSpawnAgentRequestDeduper,
  deduplicateSpawnAgentRequests,
  getSpawnAgentRequestKey,
} from '../spawn-agent'

describe('spawn agent semantic deduplication', () => {
  test('normalizes aliases, prompt whitespace, and parameter key order', () => {
    const left = getSpawnAgentRequestKey({
      agent_type: 'codebuff/researcher-web@1.0.0',
      prompt: 'Find   the latest PHP version',
      params: { beta: 2, alpha: 1 },
    })
    const right = getSpawnAgentRequestKey({
      agent_type: 'researcher_web',
      prompt: 'Find the latest PHP version',
      params: { alpha: 1, beta: 2 },
    })

    expect(left).toBe(right)
  })

  test('keeps one execution and maps duplicate indexes to the first request', () => {
    const duplicate = {
      agent_type: 'researcher-web',
      prompt: 'Find the latest Debian version',
    }
    const result = deduplicateSpawnAgentRequests([
      duplicate,
      { ...duplicate },
      {
        agent_type: 'researcher-web',
        prompt: 'Find the latest Laravel version',
      },
    ])

    expect(result.uniqueAgents).toHaveLength(2)
    expect(result.originalToUniqueIndex).toEqual([0, 0, 1])
  })

  test('removes the same request from a later tool call', () => {
    const deduper = createSpawnAgentRequestDeduper()
    const first = {
      agents: [
        {
          agent_type: 'researcher-web',
          prompt: 'Find the latest Laravel version',
        },
      ],
    }

    expect(deduper.filterInput(first)).toEqual(first)
    expect(
      deduper.filterInput({
        agents: [
          {
            agent_type: 'codebuff/researcher-web@2.0.0',
            prompt: 'Find   the latest Laravel version',
          },
        ],
      }),
    ).toBeNull()
  })

  test('removes duplicates inside the same tool call before execution', () => {
    const deduper = createSpawnAgentRequestDeduper()
    const duplicate = {
      agent_type: 'researcher-web',
      prompt: 'Find PHP',
    }
    const input = { agents: [duplicate, { ...duplicate }] }

    expect(deduper.filterInput(input)).toEqual({ agents: [duplicate] })
  })
})
