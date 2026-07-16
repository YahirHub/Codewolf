import fs from 'fs'
import path from 'path'

import { getConfigDir } from './auth'
import { AGENT_MODES } from './constants'
import { logger } from './logger'

import type { AgentMode } from './constants'

export const DEFAULT_RESEARCH_TIMEOUT_MINUTES = 15
export const MIN_RESEARCH_TIMEOUT_MINUTES = 1
export const MAX_RESEARCH_TIMEOUT_MINUTES = 120

const DEFAULT_SETTINGS: Settings = {
  mode: 'DEFAULT' as const,
  projectContextEnabled: false,
  verifiedCommitsEnabled: false,
  researchTimeoutMinutes: DEFAULT_RESEARCH_TIMEOUT_MINUTES,
}

// Note: The old FREE mode has been renamed back to LITE; migrate on load.

/**
 * Settings schema - add new settings here as the product evolves
 */
export interface Settings {
  mode?: AgentMode
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  alwaysUseALaCarte?: boolean
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  fallbackToALaCarte?: boolean
  /** Load and maintain the project's contexto/ memory through a cached agent summary. */
  projectContextEnabled?: boolean
  /** Ask the user to verify structured edits before creating a Git commit. */
  verifiedCommitsEnabled?: boolean
  /** Maximum wall-clock time for web/documentation research subagents. */
  researchTimeoutMinutes?: number
  /** Last first-run onboarding version completed by this installation. */
  onboardingVersion?: number
}

/**
 * Get the settings file path
 */
export const getSettingsPath = (configDir = getConfigDir()): string => {
  return path.join(configDir, 'settings.json')
}

/**
 * Ensure the config directory exists, creating it if necessary
 */
const ensureConfigDirExists = (configDir = getConfigDir()): void => {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * Load all settings from file system
 * @returns The saved settings object, with defaults for missing values
 */
export const loadSettings = (configDir = getConfigDir()): Settings => {
  const settingsPath = getSettingsPath(configDir)

  if (!fs.existsSync(settingsPath)) {
    ensureConfigDirExists(configDir)
    // Create default settings file
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }

  try {
    const settingsFile = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(settingsFile)
    return validateSettings(parsed)
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading settings',
    )
    return {}
  }
}

/**
 * Validate and sanitize settings from file
 */
const validateSettings = (parsed: unknown): Settings => {
  if (typeof parsed !== 'object' || parsed === null) {
    return {}
  }

  const settings: Settings = {}
  const obj = parsed as Record<string, unknown>

  // Validate mode; migrate the previously-saved 'FREE' value to 'LITE'.
  if (typeof obj.mode === 'string') {
    const normalized = obj.mode === 'FREE' ? 'LITE' : obj.mode
    if (AGENT_MODES.includes(normalized as AgentMode)) {
      settings.mode = normalized as AgentMode
    }
  }


  // Validate alwaysUseALaCarte (legacy)
  if (typeof obj.alwaysUseALaCarte === 'boolean') {
    settings.alwaysUseALaCarte = obj.alwaysUseALaCarte
  }

  // Validate fallbackToALaCarte (legacy)
  if (typeof obj.fallbackToALaCarte === 'boolean') {
    settings.fallbackToALaCarte = obj.fallbackToALaCarte
  }


  if (typeof obj.projectContextEnabled === 'boolean') {
    settings.projectContextEnabled = obj.projectContextEnabled
  }

  if (typeof obj.verifiedCommitsEnabled === 'boolean') {
    settings.verifiedCommitsEnabled = obj.verifiedCommitsEnabled
  }

  if (
    typeof obj.researchTimeoutMinutes === 'number' &&
    Number.isFinite(obj.researchTimeoutMinutes)
  ) {
    settings.researchTimeoutMinutes = Math.max(
      MIN_RESEARCH_TIMEOUT_MINUTES,
      Math.min(
        MAX_RESEARCH_TIMEOUT_MINUTES,
        Math.round(obj.researchTimeoutMinutes),
      ),
    )
  }

  if (
    typeof obj.onboardingVersion === 'number' &&
    Number.isInteger(obj.onboardingVersion) &&
    obj.onboardingVersion >= 1
  ) {
    settings.onboardingVersion = obj.onboardingVersion
  }

  return settings
}

/**
 * Save settings to file system (merges with existing settings)
 */
export const saveSettings = (
  newSettings: Partial<Settings>,
  configDir = getConfigDir(),
): void => {
  const settingsPath = getSettingsPath(configDir)

  try {
    ensureConfigDirExists(configDir)

    // Load existing settings and merge
    const existingSettings = loadSettings(configDir)
    const mergedSettings = { ...existingSettings, ...newSettings }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2))
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving settings',
    )
  }
}

/**
 * Load the saved agent mode preference
 * @returns The saved mode, or 'DEFAULT' if not found or invalid
 */
export const loadModePreference = (): AgentMode => {
  const settings = loadSettings()
  return settings.mode ?? 'DEFAULT'
}

/**
 * Save the agent mode preference
 */
export const saveModePreference = (mode: AgentMode): void => {
  saveSettings({ mode })
}


export const isProjectContextEnabled = (): boolean =>
  loadSettings().projectContextEnabled === true

export const setProjectContextEnabled = (enabled: boolean): void => {
  saveSettings({ projectContextEnabled: enabled })
}

export const isVerifiedCommitsEnabled = (): boolean =>
  loadSettings().verifiedCommitsEnabled === true

export const setVerifiedCommitsEnabled = (enabled: boolean): void => {
  saveSettings({ verifiedCommitsEnabled: enabled })
}

export const getResearchTimeoutMinutes = (): number =>
  loadSettings().researchTimeoutMinutes ?? DEFAULT_RESEARCH_TIMEOUT_MINUTES

export const setResearchTimeoutMinutes = (minutes: number): void => {
  const normalized = Math.max(
    MIN_RESEARCH_TIMEOUT_MINUTES,
    Math.min(MAX_RESEARCH_TIMEOUT_MINUTES, Math.round(minutes)),
  )
  saveSettings({ researchTimeoutMinutes: normalized })
}
