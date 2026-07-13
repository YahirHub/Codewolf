import fs from 'fs'
import os from 'os'
import path from 'path'

export const CODEWOLF_HOME_DIR_NAME = '.codewolf'
export const CODEWOLF_SKILLS_DIR_NAME = 'skills'
export const CODEWOLF_PROJECTS_DIR_NAME = 'projects'

/**
 * Returns Codewolf's single cross-platform user data directory.
 *
 * Windows: C:\\Users\\<user>\\.codewolf
 * Linux:   /home/<user>/.codewolf
 * macOS:   /Users/<user>/.codewolf
 */
export function getCodewolfHomeDir(homeDir = os.homedir()): string {
  return path.join(homeDir, CODEWOLF_HOME_DIR_NAME)
}

export function getCodewolfSkillsDir(homeDir = os.homedir()): string {
  return path.join(getCodewolfHomeDir(homeDir), CODEWOLF_SKILLS_DIR_NAME)
}

export function getCodewolfProjectsDir(homeDir = os.homedir()): string {
  return path.join(getCodewolfHomeDir(homeDir), CODEWOLF_PROJECTS_DIR_NAME)
}

/**
 * Creates the stable Codewolf user-data layout. Calling this repeatedly is safe.
 */
export function ensureCodewolfHomeLayout(homeDir = os.homedir()): string {
  const rootDir = getCodewolfHomeDir(homeDir)
  fs.mkdirSync(getCodewolfSkillsDir(homeDir), {
    recursive: true,
    mode: 0o700,
  })
  fs.mkdirSync(getCodewolfProjectsDir(homeDir), {
    recursive: true,
    mode: 0o700,
  })
  return rootDir
}
