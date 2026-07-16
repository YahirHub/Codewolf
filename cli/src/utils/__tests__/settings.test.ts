import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  DEFAULT_RESEARCH_TIMEOUT_MINUTES,
  loadSettings,
  saveSettings,
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
