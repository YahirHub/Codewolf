import { describe, expect, test } from 'bun:test'

import { publishedTools, toolNames } from '@codebuff/common/tools/constants'

import { createBase2 } from '../base2/base2'
import agent from '../general-agent/agent'
import ecosystemResearcher from '../researcher/ecosystem-researcher'

describe('ecosystem researcher', () => {
  test('keeps the structured lookup internal and out of the public tool catalog', () => {
    expect(toolNames).toContain('ecosystem_research')
    expect(publishedTools).not.toContain('ecosystem_research' as never)
  })

  test('is an isolated read-only structured research agent', () => {
    expect(ecosystemResearcher.id).toBe('ecosystem-researcher')
    expect(ecosystemResearcher.includeMessageHistory).toBe(false)
    expect(ecosystemResearcher.outputMode).toBe('structured_output')
    expect(ecosystemResearcher.toolNames).toContain('ecosystem_research')
    expect(ecosystemResearcher.toolNames).not.toContain('write_file')
    expect(ecosystemResearcher.toolNames).not.toContain('str_replace')
    expect(ecosystemResearcher.spawnableAgents).toEqual([])
    expect(ecosystemResearcher.instructionsPrompt).toContain(
      'below 2500 tokens',
    )
  })

  test('is available to default, lite, max, plan, and general agents', () => {
    for (const mode of ['default', 'lite', 'max', 'fast'] as const) {
      expect(createBase2(mode).spawnableAgents).toContain(
        'ecosystem-researcher',
      )
    }
    expect(
      createBase2('default', { planOnly: true }).spawnableAgents,
    ).toContain('ecosystem-researcher')
    expect(agent.spawnableAgents).toContain('ecosystem-researcher')
  })

  test('instructs the parent to research mutable package APIs outside its main context', () => {
    const base = createBase2('default')

    expect(base.systemPrompt).toContain(
      'Research npm and Go packages in isolation',
    )
    expect(base.systemPrompt).toContain('compact implementation brief')
    expect(base.systemPrompt).toContain('Do not open full package READMEs')
  })
})
