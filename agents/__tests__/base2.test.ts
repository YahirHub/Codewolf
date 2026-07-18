import { describe, expect, test } from 'bun:test'

import {
  deepseekModels,
  minimaxModels,
  moonshotModels,
} from '@codebuff/common/constants/model-config'

import { createBase2 } from '../base2/base2'
import codeReviewerLite from '../reviewer/code-reviewer-lite'

describe('base2 reviewer selection', () => {
  test('LITE uses the compact default model and reviewer', () => {
    const base2 = createBase2('lite')

    expect(base2.model).toBe(minimaxModels.minimaxM3)
    expect(base2.spawnableAgents).toContain('code-reviewer-lite')
    expect(base2.instructionsPrompt).toContain('Spawn a code-reviewer-lite')
    expect(base2.stepPrompt).toContain('spawn a code-reviewer-lite')
  })

  test('the LITE reviewer uses DeepSeek V4 Flash', () => {
    expect(codeReviewerLite.model).toBe(deepseekModels.deepseekV4Flash)
  })
})

describe('base2 optional tools', () => {
  test('omits gravity_index and its instruction together', () => {
    const base2 = createBase2('lite', { noGravityIndex: true })

    expect(base2.toolNames).not.toContain('gravity_index')
    expect(base2.systemPrompt).not.toContain('gravity_index')
  })
})

describe('base2 context pruning', () => {
  const getContextPrunerParams = (
    mode: Parameters<typeof createBase2>[0],
    options?: Parameters<typeof createBase2>[1],
    params?: Record<string, unknown>,
  ) => {
    const base2 = createBase2(mode, options)
    const generator = base2.handleSteps!({ params } as any)
    const step = generator.next().value as any
    return step.input.params
  }

  const getSerializedContextPrunerParams = (
    mode: Parameters<typeof createBase2>[0],
    options?: Parameters<typeof createBase2>[1],
  ) => {
    const base2 = createBase2(mode, options)
    const handleStepsString = base2.handleSteps!.toString()
    expect(handleStepsString).toMatch(/^function\*\s*\(/)
    const isolatedHandleSteps = new Function(
      `return (${handleStepsString})`,
    )() as NonNullable<typeof base2.handleSteps>
    const generator = isolatedHandleSteps({ params: undefined } as any)
    const step = generator.next().value as any
    return step.input.params
  }

  test('LITE defaults context pruning to 90% of 400k tokens', () => {
    expect(getContextPrunerParams('lite')).toEqual({
      maxContextLength: 360_000,
      cacheExpiryMs: 30 * 60 * 1000,
    })
  })

  test.each(['default', 'max', 'fast'] as const)(
    '%s defaults context pruning to 90% of 400k tokens',
    (mode) => {
      expect(getContextPrunerParams(mode)).toEqual({
        maxContextLength: 360_000,
      })
    },
  )

  test.each([
    [moonshotModels.kimiK26, 225_000],
    [deepseekModels.deepseekV4Pro, 900_000],
  ] as const)(
    'model %p defaults context pruning to %p tokens',
    (model, maxContextLength) => {
      expect(getContextPrunerParams('default', { model })).toEqual({
        maxContextLength,
      })
      expect(
        getSerializedContextPrunerParams('default', { model }),
      ).toMatchObject({ maxContextLength })
    },
  )

  test('preserves explicit context-pruner params', () => {
    expect(
      getContextPrunerParams(
        'default',
        { model: moonshotModels.kimiK26 },
        { maxContextLength: 123_000, assistantToolBudget: 10_000 },
      ),
    ).toEqual({
      maxContextLength: 123_000,
      assistantToolBudget: 10_000,
    })
  })
})

describe('base2 SSH capability', () => {
  test('enables SSH only outside read-only PLAN mode', () => {
    expect(createBase2('default').toolNames).toContain('ssh_remote')
    expect(createBase2('default').toolNames).toContain('gitzip')
    expect(createBase2('default', { planOnly: true }).toolNames).not.toContain(
      'ssh_remote',
    )
  })
})

describe('base2 plan mode', () => {
  test('enforces read-only planning through capabilities', () => {
    const plan = createBase2('default', { planOnly: true })

    expect(plan.toolNames).toContain('read_files')
    expect(plan.toolNames).toContain('ask_user')
    expect(plan.toolNames).not.toContain('write_file')
    expect(plan.toolNames).not.toContain('str_replace')
    expect(plan.toolNames).not.toContain('write_todos')
    expect(plan.toolNames).not.toContain('ssh_remote')
    expect(plan.toolNames).not.toContain('gitzip')
    expect(plan.spawnableAgents).toContain('code-searcher')
    expect(plan.spawnableAgents).not.toContain('editor')
    expect(plan.spawnableAgents).not.toContain('basher')
    expect(plan.spawnableAgents).not.toContain('agent')
  })

  test('requires an implementation-ready plan with validation and rollback', () => {
    const plan = createBase2('default', { planOnly: true })

    expect(plan.instructionsPrompt).toContain('implementation-ready plan')
    expect(plan.instructionsPrompt).toContain('Archivos afectados')
    expect(plan.instructionsPrompt).toContain('Validación')
    expect(plan.instructionsPrompt).toContain('Riesgos y reversión')
    expect(plan.instructionsPrompt).toContain('<PLAN>')
    expect(plan.stepPrompt).toContain('capability-restricted and read-only')
  })
})
