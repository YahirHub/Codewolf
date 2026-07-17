import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { upsertCustomProvider } from '../custom-providers'
import {
  getAutomaticEconomicalResearchModelReference,
  resolveCodeReviewerProviderOverride,
  resolveExplorationProviderOverrides,
  resolveOpusProviderOverride,
  resolveResearchProviderOverrides,
} from '../research-models'
import { saveSettings } from '../settings'
import { OPENCODE_FREE_PROVIDER_ID } from '../../providers/opencode-catalog'

const temporaryDirectories: string[] = []

function temporaryConfig(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'codewolf-research-models-'),
  )
  temporaryDirectories.push(directory)
  return directory
}

function addProvider(configDir: string, id: string, modelId: string): void {
  upsertCustomProvider({
    id,
    name: id,
    baseUrl: `https://${id}.example/v1`,
    apiKeyInput: `${id}-secret`,
    models: [{ id: modelId }],
    configDir,
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('research model routing', () => {
  test('resolves an optional dedicated OPUS model without changing the active model', () => {
    const configDir = temporaryConfig()
    addProvider(configDir, 'power-provider', 'reasoning-large')
    saveSettings(
      {
        opusModel: {
          providerId: 'power-provider',
          modelId: 'reasoning-large',
        },
      },
      configDir,
    )

    expect(resolveOpusProviderOverride(configDir)).toMatchObject({
      id: 'power-provider',
      modelId: 'reasoning-large',
    })
  })

  test('leaves OPUS unset so subagents inherit the active /models selection', () => {
    const configDir = temporaryConfig()
    expect(resolveOpusProviderOverride(configDir)).toBeUndefined()
  })

  test('resolves and clears a dedicated code-reviewer model', () => {
    const configDir = temporaryConfig()
    addProvider(configDir, 'review-provider', 'review-large')
    saveSettings(
      {
        codeReviewerModel: {
          providerId: 'review-provider',
          modelId: 'review-large',
        },
      },
      configDir,
    )

    expect(resolveCodeReviewerProviderOverride(configDir)).toMatchObject({
      id: 'review-provider',
      modelId: 'review-large',
    })

    saveSettings({ codeReviewerModel: undefined }, configDir)
    expect(resolveCodeReviewerProviderOverride(configDir)).toBeUndefined()
  })

  test('resolves independent exploration models and leaves missing ones unset', () => {
    const configDir = temporaryConfig()
    addProvider(configDir, 'search-provider', 'search-model')
    addProvider(configDir, 'picker-provider', 'picker-model')
    saveSettings(
      {
        codeSearcherModel: {
          providerId: 'search-provider',
          modelId: 'search-model',
        },
        filePickerModel: {
          providerId: 'picker-provider',
          modelId: 'picker-model',
        },
      },
      configDir,
    )

    expect(resolveExplorationProviderOverrides(configDir)).toMatchObject({
      'code-searcher': { id: 'search-provider', modelId: 'search-model' },
      'file-picker': { id: 'picker-provider', modelId: 'picker-model' },
    })
    expect(
      resolveExplorationProviderOverrides(configDir)['file-lister'],
    ).toBeUndefined()
  })

  test('prefers an available OpenCode Free model in automatic mode', () => {
    const configDir = temporaryConfig()
    const reference = getAutomaticEconomicalResearchModelReference(configDir)

    expect(reference?.providerId).toBe(OPENCODE_FREE_PROVIDER_ID)
    expect(reference?.modelId.endsWith('-free')).toBe(true)

    const overrides = resolveResearchProviderOverrides(configDir)
    expect(overrides['ecosystem-researcher']?.id).toBe(
      OPENCODE_FREE_PROVIDER_ID,
    )
    expect(overrides['researcher-docs']?.id).toBe(OPENCODE_FREE_PROVIDER_ID)
    expect(overrides['researcher-web']?.id).toBe(OPENCODE_FREE_PROVIDER_ID)
  })

  test('uses one configured model for every research agent', () => {
    const configDir = temporaryConfig()
    addProvider(configDir, 'cheap-provider', 'cheap-model')
    saveSettings(
      {
        researchModelMode: 'single-model',
        researchGeneralModel: {
          providerId: 'cheap-provider',
          modelId: 'cheap-model',
        },
      },
      configDir,
    )

    const overrides = resolveResearchProviderOverrides(configDir)
    expect(overrides['ecosystem-researcher']?.modelId).toBe('cheap-model')
    expect(overrides['researcher-docs']?.modelId).toBe('cheap-model')
    expect(overrides['researcher-web']?.modelId).toBe('cheap-model')
  })

  test('uses per-agent overrides and inherits the configured base model', () => {
    const configDir = temporaryConfig()
    addProvider(configDir, 'base-provider', 'base-model')
    addProvider(configDir, 'web-provider', 'web-model')
    saveSettings(
      {
        researchModelMode: 'per-agent',
        researchGeneralModel: {
          providerId: 'base-provider',
          modelId: 'base-model',
        },
        researchAgentModels: {
          web: {
            providerId: 'web-provider',
            modelId: 'web-model',
          },
        },
      },
      configDir,
    )

    const overrides = resolveResearchProviderOverrides(configDir)
    expect(overrides['ecosystem-researcher']?.modelId).toBe('base-model')
    expect(overrides['researcher-docs']?.modelId).toBe('base-model')
    expect(overrides['researcher-web']?.modelId).toBe('web-model')
  })

  test('falls back safely when a stored provider or model disappeared', () => {
    const configDir = temporaryConfig()
    saveSettings(
      {
        researchModelMode: 'single-model',
        researchGeneralModel: {
          providerId: 'removed-provider',
          modelId: 'removed-model',
        },
      },
      configDir,
    )

    const overrides = resolveResearchProviderOverrides(configDir)
    expect(overrides['ecosystem-researcher']?.id).toBe(
      OPENCODE_FREE_PROVIDER_ID,
    )
  })
})
