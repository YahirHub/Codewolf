import fs from 'fs'
import path from 'path'

import { getConfigDir } from './config-dir'
import { loadSettings, saveSettings } from './settings'

export const CURRENT_ONBOARDING_VERSION = 1

const EXISTING_INSTALLATION_FILES = [
  'providers.json',
  'provider-auth.json',
  'credentials.json',
  'search.json',
  'search-auth.json',
  'message-history.json',
  'recent-projects.json',
  'usage.jsonl',
] as const

function directoryHasEntries(directoryPath: string): boolean {
  try {
    return fs.existsSync(directoryPath) && fs.readdirSync(directoryPath).length > 0
  } catch {
    return false
  }
}

/**
 * Detect state created by a Codewolf version that predates onboarding.
 * Empty layout directories and anonymous analytics IDs are intentionally ignored,
 * because they are created before the first interactive screen appears.
 */
export function hasExistingCodewolfState(
  configDir = getConfigDir(),
): boolean {
  if (
    EXISTING_INSTALLATION_FILES.some((fileName) =>
      fs.existsSync(path.join(configDir, fileName)),
    )
  ) {
    return true
  }

  return directoryHasEntries(path.join(configDir, 'projects'))
}

/**
 * Show onboarding only for genuinely new installations. Existing users upgrading
 * from an older build are migrated silently and keep their current provider.
 */
export function shouldShowFirstRunOnboarding(
  configDir = getConfigDir(),
): boolean {
  const settings = loadSettings(configDir)
  if ((settings.onboardingVersion ?? 0) >= CURRENT_ONBOARDING_VERSION) {
    return false
  }

  if (hasExistingCodewolfState(configDir)) {
    saveSettings({ onboardingVersion: CURRENT_ONBOARDING_VERSION }, configDir)
    return false
  }

  return true
}

export function completeFirstRunOnboarding(
  configDir = getConfigDir(),
): void {
  saveSettings({ onboardingVersion: CURRENT_ONBOARDING_VERSION }, configDir)
}
