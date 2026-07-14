import * as fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'

import { stringifyJsonValue } from '@codebuff/common/util/json'
import { z } from 'zod'

import {
  getCurrentChatId,
  getProjectDataDir,
  getProjectRoot,
} from '../project-files'
import {
  CHAT_MESSAGES_FILENAME,
  readChatSessionName,
  writeChatMeta,
} from './chat-meta'
import { sanitizeRestoredMessages } from './send-message-helpers'
import { writeFileAtomic } from './write-file-atomic'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { RunState } from '@codebuff/sdk'

const CHAT_ARCHIVE_VERSION = 1 as const
const RUN_STATE_FILENAME = 'run-state.json'
const MAX_IMPORT_BYTES = 200 * 1024 * 1024

const chatMessageSchema = z
  .object({
    id: z.string(),
    variant: z.enum(['ai', 'user', 'agent', 'error']),
    content: z.string(),
    timestamp: z.string(),
  })
  .passthrough()

const chatArchiveHeaderSchema = z.object({
  type: z.literal('codewolf_chat'),
  version: z.literal(CHAT_ARCHIVE_VERSION),
  exportedAt: z.string(),
  source: z.object({
    chatId: z.string(),
    projectName: z.string(),
    projectRoot: z.string().optional(),
    name: z.string().max(120).optional(),
  }),
})

const chatArchiveMessageSchema = z.object({
  type: z.literal('message'),
  message: chatMessageSchema,
})

const chatArchiveRunStateSchema = z.object({
  type: z.literal('run_state'),
  runState: z.record(z.string(), z.unknown()).nullable(),
})

/** Compatibility with the unreleased single-object draft used during development. */
const legacyChatArchiveSchema = z.object({
  type: z.literal('codewolf-chat'),
  version: z.literal(CHAT_ARCHIVE_VERSION),
  exportedAt: z.string(),
  source: chatArchiveHeaderSchema.shape.source,
  messages: z.array(chatMessageSchema),
  runState: z.record(z.string(), z.unknown()).nullable(),
})

type ChatArchiveHeader = z.infer<typeof chatArchiveHeaderSchema>

interface ParsedChatArchive {
  header: ChatArchiveHeader
  messages: ChatMessage[]
  runState: RunState | null
}

export interface ImportedChat {
  chatId: string
  name?: string
  messages: ChatMessage[]
  runState: RunState | null
  sourceProjectName: string
  sourceProjectRoot?: string
}

export interface ChatArchivePreview {
  filePath: string
  name?: string
  sourceProjectName: string
  sourceProjectRoot?: string
  messageCount: number
  exportedAt: string
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function ensureJsonlExtension(filePath: string): string {
  if (/\.jsonl?$/i.test(filePath)) return filePath
  return `${filePath}.jsonl`
}

export function getDefaultChatExportPath(): string {
  return path.join(
    getProjectRoot(),
    `codewolf-chat-${timestampForFile()}.jsonl`,
  )
}

export function resolveChatTransferPath(
  input: string | undefined,
  mode: 'export' | 'import',
): string {
  const trimmed = stripMatchingQuotes(input ?? '')
  if (!trimmed) {
    if (mode === 'import') return ''
    return getDefaultChatExportPath()
  }

  const resolved = path.resolve(getProjectRoot(), trimmed)
  if (mode === 'export') {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(
        resolved,
        `codewolf-chat-${timestampForFile()}.jsonl`,
      )
    }
    return ensureJsonlExtension(resolved)
  }
  return resolved
}

const PORTABLE_BLOCK_TYPES = new Set([
  'agent',
  'agent-list',
  'ask-user',
  'image',
  'mode-divider',
  'plan',
  'text',
  'tool',
])

function sanitizePortableBlocks(value: unknown): ContentBlock[] | undefined {
  if (!Array.isArray(value)) return undefined

  const blocks: ContentBlock[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.type !== 'string' || !PORTABLE_BLOCK_TYPES.has(record.type)) {
      continue
    }

    if (record.type === 'agent') {
      const nested = sanitizePortableBlocks(record.blocks)
      blocks.push({
        ...(record as unknown as ContentBlock),
        ...(nested ? { blocks: nested } : { blocks: undefined }),
      } as ContentBlock)
      continue
    }

    blocks.push(record as unknown as ContentBlock)
  }
  return blocks
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const normalized = JSON.parse(stringifyJsonValue(messages)) as ChatMessage[]
  return sanitizeRestoredMessages(
    normalized.map((message) => ({
      ...message,
      blocks: sanitizePortableBlocks(message.blocks),
    })),
  )
}

function normalizeRunState(runState: RunState | null): RunState | null {
  return runState
    ? (JSON.parse(stringifyJsonValue(runState)) as RunState)
    : null
}

export function exportChatArchive(params: {
  outputPath?: string
  messages: ChatMessage[]
  runState: RunState | null
}): string {
  if (params.messages.length === 0) {
    throw new Error('La sesión actual no contiene mensajes para exportar.')
  }

  const outputPath = resolveChatTransferPath(params.outputPath, 'export')
  const chatDir = path.join(
    getProjectDataDir(),
    'chats',
    path.basename(getCurrentChatId()),
  )
  const sessionName = readChatSessionName(chatDir)
  const header: ChatArchiveHeader = {
    type: 'codewolf_chat',
    version: CHAT_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      chatId: getCurrentChatId(),
      projectName: path.basename(getProjectRoot()),
      projectRoot: getProjectRoot(),
      ...(sessionName ? { name: sessionName } : {}),
    },
  }
  const messages = normalizeMessages(params.messages)
  const runState = normalizeRunState(params.runState)
  const lines = [
    stringifyJsonValue(header),
    ...messages.map((message) =>
      stringifyJsonValue({ type: 'message', message }),
    ),
    stringifyJsonValue({ type: 'run_state', runState }),
  ]

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileAtomic(outputPath, `${lines.join('\n')}\n`)
  return outputPath
}

function validateImportFile(filePath: string): string {
  const resolved = resolveChatTransferPath(filePath, 'import')
  if (!resolved) {
    throw new Error('Indica la ruta del archivo que deseas importar.')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`No existe el archivo: ${resolved}`)
  }

  const stats = fs.statSync(resolved)
  if (!stats.isFile()) {
    throw new Error('La ruta de importación no es un archivo.')
  }
  if (stats.size > MAX_IMPORT_BYTES) {
    throw new Error('El archivo supera el límite de importación de 200 MiB.')
  }
  return resolved
}

function parseJsonlArchive(content: string): ParsedChatArchive {
  const rawLines = content.split(/\r?\n/)
  const lines = rawLines.filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    throw new Error('El archivo de exportación está vacío.')
  }

  let header: ChatArchiveHeader | null = null
  const messages: ChatMessage[] = []
  let runState: RunState | null = null

  for (let index = 0; index < lines.length; index++) {
    let parsed: unknown
    try {
      parsed = JSON.parse(lines[index]!)
    } catch {
      throw new Error(`La línea ${index + 1} no contiene JSON válido.`)
    }

    if (index === 0) {
      const headerResult = chatArchiveHeaderSchema.safeParse(parsed)
      if (!headerResult.success) {
        throw new Error(
          'La primera línea no contiene una cabecera compatible de Codewolf.',
        )
      }
      header = headerResult.data
      continue
    }

    const messageResult = chatArchiveMessageSchema.safeParse(parsed)
    if (messageResult.success) {
      messages.push(messageResult.data.message as ChatMessage)
      continue
    }

    const runStateResult = chatArchiveRunStateSchema.safeParse(parsed)
    if (runStateResult.success) {
      runState = runStateResult.data.runState as RunState | null
      continue
    }

    throw new Error(
      `La línea ${index + 1} contiene un registro no compatible de Codewolf.`,
    )
  }

  if (!header) {
    throw new Error('La exportación no contiene una cabecera de Codewolf.')
  }
  if (messages.length === 0) {
    throw new Error('La exportación no contiene mensajes.')
  }

  return { header, messages, runState }
}

function parseLegacyArchive(content: string): ParsedChatArchive | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  const result = legacyChatArchiveSchema.safeParse(parsed)
  if (!result.success) return null
  return {
    header: {
      type: 'codewolf_chat',
      version: result.data.version,
      exportedAt: result.data.exportedAt,
      source: result.data.source,
    },
    messages: result.data.messages as ChatMessage[],
    runState: result.data.runState as RunState | null,
  }
}

function readArchive(filePath: string): {
  filePath: string
  archive: ParsedChatArchive
} {
  const resolved = validateImportFile(filePath)
  const content = fs.readFileSync(resolved, 'utf8')
  const legacy = parseLegacyArchive(content)
  if (legacy) return { filePath: resolved, archive: legacy }

  try {
    return { filePath: resolved, archive: parseJsonlArchive(content) }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('El archivo no es una exportación compatible de Codewolf.')
  }
}

export function previewChatArchive(filePath: string): ChatArchivePreview {
  const { filePath: resolved, archive } = readArchive(filePath)
  return {
    filePath: resolved,
    name: archive.header.source.name,
    sourceProjectName: archive.header.source.projectName,
    sourceProjectRoot: archive.header.source.projectRoot,
    messageCount: archive.messages.length,
    exportedAt: archive.header.exportedAt,
  }
}

function createImportedChatId(): string {
  return `imported-${timestampForFile()}-${randomUUID().slice(0, 8)}`
}

export function importChatArchive(filePath: string): ImportedChat {
  const { archive } = readArchive(filePath)
  const chatId = createImportedChatId()
  const chatDir = path.join(getProjectDataDir(), 'chats', chatId)
  fs.mkdirSync(chatDir, { recursive: true })

  const messages = normalizeMessages(archive.messages)
  const runState = normalizeRunState(archive.runState)
  writeFileAtomic(
    path.join(chatDir, CHAT_MESSAGES_FILENAME),
    stringifyJsonValue(messages),
  )
  if (runState) {
    writeFileAtomic(
      path.join(chatDir, RUN_STATE_FILENAME),
      stringifyJsonValue(runState),
    )
  }

  const name =
    archive.header.source.name ??
    `Importado de ${archive.header.source.projectName}`
  writeChatMeta(chatDir, messages, { name })

  return {
    chatId,
    name,
    messages,
    runState,
    sourceProjectName: archive.header.source.projectName,
    sourceProjectRoot: archive.header.source.projectRoot,
  }
}
