import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  DEFAULT_RESEARCH_TIMEOUT_MINUTES,
  getOpusModel,
  loadSettings,
  saveSettings,
  setOpusModel,
} from '../settings'

const temporaryDirectories: string[] = []

function temporaryConfig(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-settings-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('research timeout settings', () => {
  test('writes the longer default for new installations', () => {
    const configDir = temporaryConfig()
    expect(loadSettings(configDir).researchTimeoutMinutes).toBe(
      DEFAULT_RESEARCH_TIMEOUT_MINUTES,
    )
  })

  test('persists valid minute values and clamps unsafe values', () => {
    const configDir = temporaryConfig()
    saveSettings({ researchTimeoutMinutes: 30 }, configDir)
    expect(loadSettings(configDir).researchTimeoutMinutes).toBe(30)

    saveSettings({ researchTimeoutMinutes: 999 }, configDir)
    expect(loadSettings(configDir).researchTimeoutMinutes).toBe(120)

    saveSettings({ researchTimeoutMinutes: 0 }, configDir)
    expect(loadSettings(configDir).researchTimeoutMinutes).toBe(1)
  })
})

describe('research and OPUS model settings', () => {
  test('uses automatic economical routing by default', () => {
    const configDir = temporaryConfig()
    expect(loadSettings(configDir).researchModelMode).toBe(
      'automatic-economical',
    )
  })

  test('persists a general model, OPUS model, and per-agent overrides', () => {
    const configDir = temporaryConfig()
    saveSettings(
      {
        researchModelMode: 'per-agent',
        researchGeneralModel: {
          providerId: 'opencode-free',
          modelId: 'fast-free',
        },
        opusModel: {
          providerId: 'premium-provider',
          modelId: 'reasoning-large',
        },
        researchAgentModels: {
          ecosystem: {
            providerId: 'nvidia-nim',
            modelId: 'deepseek-ai/deepseek-v4-flash',
          },
          web: {
            providerId: 'custom',
            modelId: 'search-small',
          },
        },
      },
      configDir,
    )

    expect(loadSettings(configDir)).toMatchObject({
      researchModelMode: 'per-agent',
      researchGeneralModel: {
        providerId: 'opencode-free',
        modelId: 'fast-free',
      },
      opusModel: {
        providerId: 'premium-provider',
        modelId: 'reasoning-large',
      },
      researchAgentModels: {
        ecosystem: {
          providerId: 'nvidia-nim',
          modelId: 'deepseek-ai/deepseek-v4-flash',
        },
        web: {
          providerId: 'custom',
          modelId: 'search-small',
        },
      },
    })
  })

  test('clears the OPUS preference so agents inherit /models again', () => {
    const configDir = temporaryConfig()
    setOpusModel(
      { providerId: 'premium-provider', modelId: 'reasoning-large' },
      configDir,
    )
    expect(getOpusModel(configDir)?.modelId).toBe('reasoning-large')

    setOpusModel(undefined, configDir)
    expect(getOpusModel(configDir)).toBeUndefined()
  })

  test('drops invalid model references instead of loading partial values', () => {
    const configDir = temporaryConfig()
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({
        researchModelMode: 'invalid',
        researchGeneralModel: { providerId: 'provider-only' },
        opusModel: { providerId: 'opus-only' },
        researchAgentModels: {
          ecosystem: { providerId: '', modelId: 'model' },
          documentation: { providerId: 'docs', modelId: 'small' },
        },
      }),
    )

    expect(loadSettings(configDir)).toEqual({
      researchAgentModels: {
        documentation: { providerId: 'docs', modelId: 'small' },
      },
    })
  })
})
