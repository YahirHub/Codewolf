import fs from 'fs'
import path from 'path'

import { getConfigDir } from './auth'
import { logger } from './logger'

export interface RecentProject {
  path: string
  lastOpened: number
}

function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath)
}

function projectPathKey(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Get the recent projects file path
 */
export const getRecentProjectsPath = (): string => {
  return path.join(getConfigDir(), 'recent-projects.json')
}

/**
 * Load every known project from file system, sorted by most recent first.
 * The project picker only renders a few entries, while /history uses the full
 * list to discover conversations saved under other working directories.
 */
export const loadRecentProjects = (): RecentProject[] => {
  const recentProjectsPath = getRecentProjectsPath()

  if (!fs.existsSync(recentProjectsPath)) {
    return []
  }

  try {
    const fileContent = fs.readFileSync(recentProjectsPath, 'utf8')
    const parsed = JSON.parse(fileContent)

    if (!Array.isArray(parsed)) {
      return []
    }

    const seen = new Set<string>()
    const validProjects = parsed.filter((item): item is RecentProject => {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.path !== 'string' ||
        typeof item.lastOpened !== 'number'
      ) {
        return false
      }

      let normalizedPath: string
      try {
        normalizedPath = normalizeProjectPath(item.path)
      } catch {
        return false
      }

      const key = projectPathKey(normalizedPath)
      if (seen.has(key)) {
        return false
      }

      try {
        if (!fs.existsSync(normalizedPath)) {
          return false
        }
      } catch {
        return false
      }

      seen.add(key)
      item.path = normalizedPath
      return true
    })

    return validProjects.sort((a, b) => b.lastOpened - a.lastOpened)
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Error reading recent projects',
    )
    return []
  }
}

/**
 * Clear all recent projects
 */
export const clearRecentProjects = (): void => {
  const recentProjectsPath = getRecentProjectsPath()

  try {
    if (fs.existsSync(recentProjectsPath)) {
      fs.writeFileSync(recentProjectsPath, JSON.stringify([], null, 2))
    }
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Error clearing recent projects',
    )
  }
}

/**
 * Remove a specific project from the recent projects list
 */
export const removeRecentProject = (projectPath: string): void => {
  const recentProjectsPath = getRecentProjectsPath()
  const targetKey = projectPathKey(projectPath)

  try {
    const existingProjects = loadRecentProjects()
    const filteredProjects = existingProjects.filter(
      (project) => projectPathKey(project.path) !== targetKey,
    )

    fs.writeFileSync(
      recentProjectsPath,
      JSON.stringify(filteredProjects, null, 2),
    )
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Error removing recent project',
    )
  }
}

/**
 * Save a project to the known-project list.
 * Updates the timestamp if the project already exists and retains all known
 * paths so /history can later browse sessions from any of them.
 */
export const saveRecentProject = (projectPath: string): void => {
  const normalizedPath = normalizeProjectPath(projectPath)

  if (!fs.existsSync(normalizedPath)) {
    logger.debug(
      { projectPath: normalizedPath },
      'Skipping save for non-existent project path',
    )
    return
  }

  const configDir = getConfigDir()
  const recentProjectsPath = getRecentProjectsPath()
  const targetKey = projectPathKey(normalizedPath)

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const existingProjects = loadRecentProjects()
    const filteredProjects = existingProjects.filter(
      (project) => projectPathKey(project.path) !== targetKey,
    )

    const updatedProjects: RecentProject[] = [
      { path: normalizedPath, lastOpened: Date.now() },
      ...filteredProjects,
    ]

    fs.writeFileSync(
      recentProjectsPath,
      JSON.stringify(updatedProjects, null, 2),
    )
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Error saving recent project',
    )
  }
}
