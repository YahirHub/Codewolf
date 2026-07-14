import * as fs from 'fs'
import path from 'path'

import { z } from 'zod'

import { writeFileAtomic } from './write-file-atomic'

import type { ChatMessage } from '../types/chat'

export const CHAT_MESSAGES_FILENAME = 'chat-messages.json'
export const CHAT_META_FILENAME = 'chat-meta.json'

const SESSION_NAME_MAX_LENGTH = 120

/**
 * Small sidecar summary of a chat written alongside chat-messages.json.
 * Transcripts are unbounded and can grow to many MB, so /history reads this
 * instead of parsing every full chat-messages.json.
 *
 * messagesSize/messagesMtimeMs bind the sidecar to the exact messages file it
 * summarizes: if the transcript is later rewritten by anything that doesn't
 * refresh the sidecar (an older CLI version, a crash between the two writes),
 * readChatMeta rejects the stale sidecar and callers fall back to the full
 * parse instead of showing outdated data or hiding corruption.
 */
const chatMetaSchema = z.object({
  messageCount: z.number(),
  firstPrompt: z.string(),
  messagesSize: z.number(),
  messagesMtimeMs: z.number(),
  name: z.string().max(SESSION_NAME_MAX_LENGTH).optional(),
})

export type ChatMeta = z.infer<typeof chatMetaSchema>

export function normalizeChatSessionName(name: string): string {
  const normalized = name
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) throw new Error('El nombre de la sesión no puede estar vacío.')
  if (normalized.length > SESSION_NAME_MAX_LENGTH) {
    throw new Error(
      `El nombre de la sesión no puede superar ${SESSION_NAME_MAX_LENGTH} caracteres.`,
    )
  }
  return normalized
}

/**
 * Get the first user message from a list of chat messages
 */
export function getFirstUserPrompt(messages: ChatMessage[]): string {
  for (const msg of messages) {
    if (msg?.variant === 'user' && msg.content) {
      const content = msg.content.trim()
      if (content.length > 100) {
        return content.slice(0, 97) + '...'
      }
      return content
    }
  }
  return '(empty chat)'
}

function readChatMetaUnchecked(chatDir: string): ChatMeta | null {
  try {
    const raw = fs.readFileSync(path.join(chatDir, CHAT_META_FILENAME), 'utf8')
    const parsed = chatMetaSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function readChatSessionName(chatDir: string): string | undefined {
  return readChatMetaUnchecked(chatDir)?.name
}

/**
 * Write the sidecar for the given chat directory. The chat-messages.json in
 * that directory must already contain exactly `messages` (its stats are
 * recorded to bind the sidecar to it). Existing user-defined names are
 * preserved unless an explicit name is supplied.
 */
export function writeChatMeta(
  chatDir: string,
  messages: ChatMessage[],
  options: { name?: string } = {},
): void {
  const stats = fs.statSync(path.join(chatDir, CHAT_MESSAGES_FILENAME))
  const existingName = readChatMetaUnchecked(chatDir)?.name
  const requestedName = options.name
    ? normalizeChatSessionName(options.name)
    : existingName
  const meta: ChatMeta = {
    messageCount: messages.length,
    firstPrompt: getFirstUserPrompt(messages),
    messagesSize: stats.size,
    messagesMtimeMs: stats.mtimeMs,
    ...(requestedName ? { name: requestedName } : {}),
  }
  writeFileAtomic(path.join(chatDir, CHAT_META_FILENAME), JSON.stringify(meta))
}

export function setChatSessionName(
  chatDir: string,
  name: string,
): string {
  const normalized = normalizeChatSessionName(name)
  fs.mkdirSync(chatDir, { recursive: true })
  const messagesPath = path.join(chatDir, CHAT_MESSAGES_FILENAME)
  let messages: ChatMessage[] = []

  if (fs.existsSync(messagesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(messagesPath, 'utf8')) as unknown
      if (Array.isArray(parsed)) messages = parsed as ChatMessage[]
    } catch {
      throw new Error(
        'No se puede renombrar la sesión porque chat-messages.json está dañado.',
      )
    }
  } else {
    writeFileAtomic(messagesPath, '[]')
  }

  writeChatMeta(chatDir, messages, { name: normalized })
  return normalized
}

/**
 * Read the sidecar for a chat directory. Returns null when it is missing,
 * unparsable, or stale (chat-messages.json no longer matches the recorded
 * size/mtime) — callers should fall back to parsing chat-messages.json.
 */
export function readChatMeta(chatDir: string): ChatMeta | null {
  try {
    const meta = readChatMetaUnchecked(chatDir)
    if (!meta) return null
    const stats = fs.statSync(path.join(chatDir, CHAT_MESSAGES_FILENAME))
    if (
      stats.size !== meta.messagesSize ||
      stats.mtimeMs !== meta.messagesMtimeMs
    ) {
      return null
    }
    return meta
  } catch {
    return null
  }
}
