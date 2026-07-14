import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  getCurrentChatDir,
  setCurrentChatId,
  setProjectRoot,
  tryGetProjectRoot,
} from '../../project-files'
import { readChatMeta, setChatSessionName } from '../chat-meta'
import {
  exportChatArchive,
  importChatArchive,
  previewChatArchive,
  resolveChatTransferPath,
} from '../chat-transfer'

import type { ChatMessage } from '../../types/chat'
import type { RunState } from '@codebuff/sdk'

function message(
  id: string,
  variant: ChatMessage['variant'],
  content: string,
): ChatMessage {
  return {
    id,
    variant,
    content,
    timestamp: new Date().toISOString(),
    blocks: [],
  }
}

describe('chat transfer', () => {
  let tempRoot = ''
  let tempHome = ''
  let projectRoot = ''
  let originalHome: string | undefined
  let originalUserProfile: string | undefined
  let originalProjectRoot: string | undefined

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-transfer-'))
    tempHome = path.join(tempRoot, 'home')
    projectRoot = path.join(tempRoot, 'project')
    fs.mkdirSync(tempHome, { recursive: true })
    fs.mkdirSync(projectRoot, { recursive: true })

    originalHome = process.env.HOME
    originalUserProfile = process.env.USERPROFILE
    originalProjectRoot = tryGetProjectRoot()
    process.env.HOME = tempHome
    process.env.USERPROFILE = tempHome
    setProjectRoot(projectRoot)
    setCurrentChatId('source-chat')
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalUserProfile
    setProjectRoot(originalProjectRoot ?? process.cwd())
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('exports a portable JSONL archive and imports it as a new local chat', () => {
    const messages = [
      message('user-1', 'user', 'Analiza este proyecto'),
      message('ai-1', 'ai', 'Comenzaré por la estructura.'),
    ]
    const runState = {
      output: { type: 'text', value: 'estado portable' },
    } as unknown as RunState

    const chatDir = getCurrentChatDir()
    fs.writeFileSync(
      path.join(chatDir, 'chat-messages.json'),
      JSON.stringify(messages),
    )
    setChatSessionName(chatDir, 'Auditoría inicial')

    const output = exportChatArchive({
      outputPath: path.join(tempRoot, 'exports', 'sesion'),
      messages,
      runState,
    })

    expect(output.endsWith('.jsonl')).toBe(true)
    const records = fs
      .readFileSync(output, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line))
    expect(records[0]).toMatchObject({
      type: 'codewolf_chat',
      version: 1,
      source: { name: 'Auditoría inicial' },
    })
    expect(records.filter((record) => record.type === 'message')).toHaveLength(2)
    expect(records.at(-1)).toMatchObject({ type: 'run_state' })

    const preview = previewChatArchive(`"${output}"`)
    expect(preview).toMatchObject({
      name: 'Auditoría inicial',
      messageCount: 2,
      sourceProjectName: path.basename(projectRoot),
    })

    const imported = importChatArchive(output)
    expect(imported.chatId).not.toBe('source-chat')
    expect(imported.name).toBe('Auditoría inicial')
    expect(imported.messages).toEqual(messages)
    expect(imported.runState).toEqual(runState)

    const importedDir = path.join(
      tempHome,
      '.codewolf',
      'projects',
      path.basename(projectRoot),
      'chats',
      imported.chatId,
    )
    expect(fs.existsSync(path.join(importedDir, 'chat-messages.json'))).toBe(true)
    expect(fs.existsSync(path.join(importedDir, 'run-state.json'))).toBe(true)
    expect(readChatMeta(importedDir)).toMatchObject({
      name: 'Auditoría inicial',
      messageCount: 2,
    })
  })

  test('supports quoted paths with spaces without stripping apostrophes inside names', () => {
    const quoted = resolveChatTransferPath(
      '"exports/chat with spaces.jsonl"',
      'import',
    )
    expect(quoted).toBe(path.join(projectRoot, 'exports', 'chat with spaces.jsonl'))

    const apostrophe = resolveChatTransferPath(
      "exports/john's chat.jsonl",
      'import',
    )
    expect(apostrophe).toBe(path.join(projectRoot, 'exports', "john's chat.jsonl"))
  })

  test('rejects invalid or empty exports before creating a chat', () => {
    const invalid = path.join(tempRoot, 'invalid.jsonl')
    fs.writeFileSync(invalid, '{"type":"other"}\n')
    expect(() => previewChatArchive(invalid)).toThrow()

    expect(() =>
      exportChatArchive({ outputPath: invalid, messages: [], runState: null }),
    ).toThrow('no contiene mensajes')
  })
})
