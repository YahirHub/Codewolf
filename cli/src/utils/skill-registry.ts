import { loadSkills as sdkLoadSkills } from '@codebuff/sdk'
import fs from 'fs'
import path from 'path'

import { getProjectRoot } from '../project-files'
import { logger } from './logger'

import type { SkillDefinition, SkillsMap } from '@codebuff/common/types/skill'

// ============================================================================
// Skills cache (loaded via SDK at startup)
// ============================================================================

let skillsCache: SkillsMap = {}

/**
 * Initialize the skill registry by loading skills via the SDK.
 * This must be called at CLI startup.
 *
 * Skills are loaded from:
 * - ~/.codewolf/skills/ (global)
 * - {projectRoot}/.codewolf/skills/ (project, overrides global)
 */
export async function initializeSkillRegistry(): Promise<void> {
  const cwd = getProjectRoot() || process.cwd()

  try {
    // Keep a predictable project-local import location available. Users can
    // copy any skill directory containing SKILL.md into .codewolf/skills.
    const projectCodewolfDir = path.join(cwd, '.codewolf')
    fs.mkdirSync(path.join(projectCodewolfDir, 'skills'), { recursive: true })

    // Research data is reproducible local cache, while project skills may be
    // intentionally versioned. Keep only the cache out of Git by default.
    const projectIgnorePath = path.join(projectCodewolfDir, '.gitignore')
    const ignoreEntry = 'research-cache/'
    const currentIgnore = fs.existsSync(projectIgnorePath)
      ? fs.readFileSync(projectIgnorePath, 'utf8')
      : ''
    if (
      !currentIgnore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .includes(ignoreEntry)
    ) {
      const prefix = currentIgnore && !currentIgnore.endsWith('\n') ? '\n' : ''
      fs.writeFileSync(
        projectIgnorePath,
        `${currentIgnore}${prefix}${ignoreEntry}\n`,
      )
    }

    // Load skills from global and project .codewolf/skills directories
    // The SDK handles merging, with project skills overriding global ones
    skillsCache = await sdkLoadSkills({
      cwd,
      verbose: false,
    })
  } catch (error) {
    logger.warn({ error }, 'Failed to load skills')
    skillsCache = {}
  }
}

// ============================================================================
// Skills access
// ============================================================================

/**
 * Get all loaded skills.
 */
export function getLoadedSkills(): SkillsMap {
  return skillsCache
}

/**
 * Get a skill by name.
 */
export function getSkillByName(name: string): SkillDefinition | undefined {
  return skillsCache[name]
}

/**
 * Get the number of loaded skills.
 */
export function getSkillCount(): number {
  return Object.keys(skillsCache).length
}

// ============================================================================
// UI/Display utilities
// ============================================================================

/**
 * Get a message describing loaded skills for display.
 */
export function getLoadedSkillsMessage(): string | null {
  const skills = Object.values(skillsCache)

  if (skills.length === 0) {
    return null
  }

  const header = `Se cargaron ${skills.length} skill${skills.length === 1 ? '' : 's'}`
  const skillList = skills
    .map(
      (skill) =>
        `  - ${skill.name}: ${skill.description.slice(0, 60)}${skill.description.length > 60 ? '...' : ''}`,
    )
    .join('\n')

  return `${header}\n${skillList}`
}

// ============================================================================
// Testing utilities
// ============================================================================

/**
 * Clear cached skills. Intended for test scenarios.
 */
export function __resetSkillRegistryForTests(): void {
  skillsCache = {}
}
