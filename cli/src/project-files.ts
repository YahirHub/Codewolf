import { mkdirSync, readdirSync, statSync } from 'fs'
import path from 'path'

import { getConfigDir } from './utils/auth'

let projectRoot: string | undefined
let currentChatId: string | undefined

function ensureChatDirectory(dir: string) {
  mkdirSync(dir, { recursive: true })
}

export function setProjectRoot(dir: string) {
  projectRoot = dir
  return projectRoot
}

export function getProjectRoot() {
  if (!projectRoot) {
    throw new Error('No se ha establecido la raíz del proyecto')
  }
  return projectRoot
}

export function tryGetProjectRoot() {
  return projectRoot
}

export function getCurrentChatId() {
  if (!currentChatId) {
    currentChatId = new Date().toISOString().replace(/:/g, '-')
  }
  return currentChatId
}

export function setCurrentChatId(chatId: string) {
  currentChatId = chatId
  return currentChatId
}

export function startNewChat() {
  currentChatId = new Date().toISOString().replace(/:/g, '-')
  return currentChatId
}

// Resolve the project-specific data directory for any project root.
// Kept as a pure helper so /history can inspect sessions from other paths
// without changing the active project first.
export function getProjectDataDirForRoot(root: string): string {
  const resolvedRoot = path.resolve(root)
  const baseName = path.basename(resolvedRoot)
  return path.join(getConfigDir(), 'projects', baseName)
}

// Get the project-specific data directory for the active project.
export function getProjectDataDir(): string {
  return getProjectDataDirForRoot(getProjectRoot())
}

/**
 * Find the most recent chat directory based on modification time
 * Returns null if no chat directories exist
 */
export function getMostRecentChatDir(): string | null {
  try {
    const chatsDir = path.join(getProjectDataDir(), 'chats')
    if (!statSync(chatsDir, { throwIfNoEntry: false })) {
      return null
    }

    const chatDirs = readdirSync(chatsDir)
      .map((name) => {
        const fullPath = path.join(chatsDir, name)
        try {
          const stat = statSync(fullPath)
          return { name, fullPath, mtime: stat.mtime }
        } catch {
          return null
        }
      })
      .filter(
        (item): item is { name: string; fullPath: string; mtime: Date } =>
          item !== null && statSync(item.fullPath).isDirectory(),
      )

    if (chatDirs.length === 0) {
      return null
    }

    // Sort by modification time, most recent first
    chatDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    return chatDirs[0].fullPath
  } catch {
    return null
  }
}

export function getCurrentChatDir(): string {
  const chatId = getCurrentChatId()
  const dir = path.join(getProjectDataDir(), 'chats', chatId)
  ensureChatDirectory(dir)
  return dir
}
