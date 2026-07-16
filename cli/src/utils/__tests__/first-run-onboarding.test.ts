import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  CURRENT_ONBOARDING_VERSION,
  completeFirstRunOnboarding,
  hasExistingCodewolfState,
  shouldShowFirstRunOnboarding,
} from '../first-run-onboarding'
import { loadSettings } from '../settings'

let configDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-onboarding-'))
})

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true })
})

describe('first-run onboarding', () => {
  test('shows for a new installation and persists completion', () => {
    expect(shouldShowFirstRunOnboarding(configDir)).toBe(true)

    completeFirstRunOnboarding(configDir)

    expect(shouldShowFirstRunOnboarding(configDir)).toBe(false)
    expect(loadSettings(configDir).onboardingVersion).toBe(
      CURRENT_ONBOARDING_VERSION,
    )
  })

  test('does not treat empty layout directories as an existing installation', () => {
    fs.mkdirSync(path.join(configDir, 'projects'), { recursive: true })
    fs.mkdirSync(path.join(configDir, 'skills'), { recursive: true })

    expect(hasExistingCodewolfState(configDir)).toBe(false)
    expect(shouldShowFirstRunOnboarding(configDir)).toBe(true)
  })

  test('silently migrates users that already have provider configuration', () => {
    fs.writeFileSync(
      path.join(configDir, 'providers.json'),
      JSON.stringify({ version: 1, providers: [] }),
    )

    expect(hasExistingCodewolfState(configDir)).toBe(true)
    expect(shouldShowFirstRunOnboarding(configDir)).toBe(false)
    expect(loadSettings(configDir).onboardingVersion).toBe(
      CURRENT_ONBOARDING_VERSION,
    )
  })

  test('detects existing project sessions', () => {
    const projectDir = path.join(configDir, 'projects', 'example')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'session.json'), '{}')

    expect(hasExistingCodewolfState(configDir)).toBe(true)
  })
})
