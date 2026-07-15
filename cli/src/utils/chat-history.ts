import * as fs from 'fs'
import path from 'path'

import {
  CHAT_MESSAGES_FILENAME,
  getFirstUserPrompt,
  readChatMeta,
  readChatSessionName,
} from './chat-meta'
import { CHAT_LOG_FILENAME, logger } from './logger'
import { loadRecentProjects } from './recent-projects'
import {
  getProjectDataDir,
  getProjectDataDirForRoot,
  getProjectRoot,
} from '../project-files'

import type { ChatMessage } from '../types/chat'

export interface ChatHistoryEntry {
  chatId: string
  lastPrompt: string
  timestamp: Date
  messageCount: number
  /** True when chat-messages.json exists but can't be parsed (e.g. truncated
   * by a crash mid-write). Shown in /history so the chat doesn't silently
   * vanish; can be deleted but not resumed. */
  unreadable?: boolean
  /** User-defined session name set through /rename. */
  name?: string
}

export interface ProjectChatHistoryEntry extends ChatHistoryEntry {
  projectPath: string
  projectName: string
  dataDir: string
}

export interface ProjectHistorySource {
  projectPath: string
  dataDir: string
}

function getChatsDir(dataDir: string = getProjectDataDir()): string {
  return path.join(dataDir, 'chats')
}

interface ChatDirInfo {
  chatId: string
  chatPath: string
  messagesPath: string
  mtime: Date
  dataDir: string
}

function listChatDirInfos(dataDir: string): ChatDirInfo[] {
  const chatsDir = getChatsDir(dataDir)
  let chatIds: string[]
  try {
    if (!fs.existsSync(chatsDir)) {
      return []
    }
    chatIds = fs.readdirSync(chatsDir)
  } catch (error) {
    logger.debug(
      {
        chatsDir,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to read project chat directory',
    )
    return []
  }

  const chatDirInfos: ChatDirInfo[] = []
  for (const chatId of chatIds) {
    const chatPath = path.join(chatsDir, chatId)
    try {
      const stat = fs.statSync(chatPath)
      if (!stat.isDirectory()) continue

      chatDirInfos.push({
        chatId,
        chatPath,
        messagesPath: path.join(chatPath, CHAT_MESSAGES_FILENAME),
        mtime: stat.mtime,
        dataDir,
      })
    } catch {
      // Skip directories we can't stat.
    }
  }

  return chatDirInfos
}

function readChatHistoryEntry(info: ChatDirInfo): ChatHistoryEntry | null {
  try {
    let messageCount = 0
    let lastPrompt = '(empty chat)'
    const name = readChatSessionName(info.chatPath)

    if (fs.existsSync(info.messagesPath)) {
      // Prefer the sidecar summary: transcripts are unbounded, so parsing every
      // full chat-messages.json here can make /history slow.
      const meta = readChatMeta(info.chatPath)
      if (meta) {
        messageCount = meta.messageCount
        lastPrompt = meta.firstPrompt
      } else {
        // Pre-sidecar chats, or a sidecar that no longer matches the messages
        // file: parse the full transcript.
        const content = fs.readFileSync(info.messagesPath, 'utf8')
        const messages = JSON.parse(content) as ChatMessage[]
        if (!Array.isArray(messages)) {
          throw new Error('chat-messages.json is not an array')
        }
        messageCount = messages.length
        lastPrompt = getFirstUserPrompt(messages)
      }
    }

    if (messageCount === 0) {
      return null
    }

    return {
      chatId: info.chatId,
      lastPrompt,
      timestamp: info.mtime,
      messageCount,
      ...(name ? { name } : {}),
    }
  } catch (error) {
    logger.debug(
      {
        chatId: info.chatId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to read chat messages',
    )

    return {
      chatId: info.chatId,
      lastPrompt: '(unreadable chat)',
      timestamp: info.mtime,
      messageCount: 0,
      unreadable: true,
    }
  }
}

/**
 * List all available chats for one project, sorted by most recent first.
 * @param maxChats - Maximum number of chats to load (default: 500)
 */
export function getAllChats(
  maxChats: number = 500,
  dataDir?: string,
): ChatHistoryEntry[] {
  try {
    const chatDirInfos = listChatDirInfos(dataDir ?? getProjectDataDir())
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, maxChats)

    return chatDirInfos
      .map(readChatHistoryEntry)
      .filter((chat): chat is ChatHistoryEntry => chat !== null)
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to list chats',
    )
    return []
  }
}

/**
 * List chats across the supplied project paths. Directory metadata is merged
 * and sorted before transcripts are read, so the global view only opens the
 * newest `maxChats` entries instead of parsing every saved conversation.
 */
export function getChatsForProjects(
  sources: ProjectHistorySource[],
  maxChats: number = 500,
): ProjectChatHistoryEntry[] {
  try {
    const sourceByDataDir = new Map<string, ProjectHistorySource>()
    for (const source of sources) {
      const resolvedPath = path.resolve(source.projectPath)
      const dataDir = path.resolve(source.dataDir)
      // The current storage layout is based on the project basename. If two
      // paths resolve to the same data directory, keep the first source rather
      // than rendering every chat twice.
      if (!sourceByDataDir.has(dataDir)) {
        sourceByDataDir.set(dataDir, {
          projectPath: resolvedPath,
          dataDir,
        })
      }
    }

    const combined = Array.from(sourceByDataDir.values()).flatMap((source) =>
      listChatDirInfos(source.dataDir).map((info) => ({ info, source })),
    )

    combined.sort((a, b) => b.info.mtime.getTime() - a.info.mtime.getTime())

    const chats: ProjectChatHistoryEntry[] = []
    for (const { info, source } of combined.slice(0, maxChats)) {
      const chat = readChatHistoryEntry(info)
      if (!chat) continue

      chats.push({
        ...chat,
        projectPath: source.projectPath,
        projectName: path.basename(source.projectPath) || source.projectPath,
        dataDir: source.dataDir,
      })
    }

    return chats
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to list chats across projects',
    )
    return []
  }
}

/**
 * List chats from the active project and every other existing path remembered
 * by Codewolf. The active project is inserted first so it wins any legacy
 * basename-based storage collision.
 */
export function getAllProjectChats(
  maxChats: number = 500,
  currentProjectPath: string = getProjectRoot(),
): ProjectChatHistoryEntry[] {
  const projectPaths = [
    currentProjectPath,
    ...loadRecentProjects().map((project) => project.path),
  ]

  const seenPaths = new Set<string>()
  const sources: ProjectHistorySource[] = []
  for (const projectPath of projectPaths) {
    const resolved = path.resolve(projectPath)
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    if (seenPaths.has(key)) continue
    seenPaths.add(key)

    sources.push({
      projectPath: resolved,
      dataDir: getProjectDataDirForRoot(resolved),
    })
  }

  return getChatsForProjects(sources, maxChats)
}

// Older CLI versions logged the full conversation (including attachments) to
// log.jsonl on every step, leaving multi-GB files in chat directories. Delete
// any log file over this cap; with summary-only logging, healthy logs stay
// far below it.
const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024
// Only delete logs from chats untouched for this long, so debug logs for
// recent chats stay available.
const MIN_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Delete oversized log.jsonl files from chat directories that haven't been
 * touched in 14+ days. Only debug logs are removed — chat history files are
 * untouched.
 */
export function trimOversizedChatLogs(dataDir?: string): void {
  let chatsDir: string
  let chatIds: string[]
  try {
    chatsDir = getChatsDir(dataDir)
    chatIds = fs.readdirSync(chatsDir)
  } catch {
    return // No project root set or no chats directory yet
  }

  const deleteBefore = Date.now() - MIN_LOG_AGE_MS
  for (const chatId of chatIds) {
    const logFile = path.join(chatsDir, chatId, CHAT_LOG_FILENAME)
    try {
      const stats = fs.statSync(logFile, { throwIfNoEntry: false })
      if (
        stats &&
        stats.size > MAX_LOG_FILE_BYTES &&
        stats.mtimeMs < deleteBefore
      ) {
        fs.unlinkSync(logFile)
      }
    } catch {
      // Ignore errors for individual files
    }
  }
}

/**
 * Delete a saved chat session from local history.
 */
export function deleteChatSession(chatId: string, dataDir?: string): boolean {
  try {
    const safeChatId = chatId.trim()
    if (
      !safeChatId ||
      safeChatId === '.' ||
      safeChatId === '..' ||
      path.basename(safeChatId) !== safeChatId
    ) {
      logger.warn({ chatId }, 'Refusing to delete invalid chat id')
      return false
    }

    const chatsDir = getChatsDir(dataDir)
    const chatPath = path.join(chatsDir, safeChatId)

    if (!fs.existsSync(chatPath)) {
      return false
    }

    const stat = fs.statSync(chatPath)
    if (!stat.isDirectory()) {
      logger.warn(
        { chatId, chatPath },
        'Refusing to delete non-directory chat path',
      )
      return false
    }

    fs.rmSync(chatPath, { recursive: true, force: false })
    return true
  } catch (error) {
    logger.error(
      { chatId, error: error instanceof Error ? error.message : String(error) },
      'Failed to delete chat session',
    )
    return false
  }
}

/**
 * Format a timestamp relative to now (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays === 1) {
    return 'yesterday'
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString()
  }
}
