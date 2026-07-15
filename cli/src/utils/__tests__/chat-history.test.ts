import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

mock.module('../logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  },
}))

import {
  deleteChatSession,
  getAllChats,
  getChatsForProjects,
} from '../chat-history'

let tempDataDir = ''

function writeChat(chatId: string, prompt: string) {
  const chatDir = path.join(tempDataDir, 'chats', chatId)
  fs.mkdirSync(chatDir, { recursive: true })
  fs.writeFileSync(
    path.join(chatDir, 'chat-messages.json'),
    JSON.stringify([
      {
        id: `${chatId}-message`,
        variant: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        blocks: [],
      },
    ]),
  )
}

describe('chat-history', () => {
  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-history-'))
  })

  afterEach(() => {
    fs.rmSync(tempDataDir, { recursive: true, force: true })
  })

  test('deleteChatSession removes a saved chat directory', () => {
    writeChat('chat-a', 'hello from chat a')
    writeChat('chat-b', 'hello from chat b')

    expect(deleteChatSession('chat-a', tempDataDir)).toBe(true)

    expect(fs.existsSync(path.join(tempDataDir, 'chats', 'chat-a'))).toBe(false)
    expect(fs.existsSync(path.join(tempDataDir, 'chats', 'chat-b'))).toBe(true)
    expect(getAllChats(500, tempDataDir).map((chat) => chat.chatId)).toEqual([
      'chat-b',
    ])
  })

  test('deleteChatSession rejects invalid chat ids', () => {
    const outsideDir = path.join(tempDataDir, 'outside')
    fs.mkdirSync(outsideDir, { recursive: true })

    expect(deleteChatSession('../outside', tempDataDir)).toBe(false)
    expect(deleteChatSession('..', tempDataDir)).toBe(false)

    expect(fs.existsSync(outsideDir)).toBe(true)
  })

  test('deleteChatSession returns false when the chat does not exist', () => {
    expect(deleteChatSession('missing-chat', tempDataDir)).toBe(false)
  })

  test('getAllChats lists corrupt chats as unreadable instead of hiding them', () => {
    writeChat('chat-good', 'hello from a healthy chat')

    // Simulate a chat-messages.json truncated by a crash mid-write
    const corruptDir = path.join(tempDataDir, 'chats', 'chat-corrupt')
    fs.mkdirSync(corruptDir, { recursive: true })
    fs.writeFileSync(
      path.join(corruptDir, 'chat-messages.json'),
      '[{"id":"msg-1","variant":"user","content":"truncat',
    )

    const chats = getAllChats(500, tempDataDir)

    const good = chats.find((chat) => chat.chatId === 'chat-good')
    expect(good).toBeDefined()
    expect(good?.unreadable).toBeUndefined()
    expect(good?.lastPrompt).toBe('hello from a healthy chat')

    const corrupt = chats.find((chat) => chat.chatId === 'chat-corrupt')
    expect(corrupt).toBeDefined()
    expect(corrupt?.unreadable).toBe(true)
    expect(corrupt?.lastPrompt).toBe('(unreadable chat)')
  })

  test('getAllChats lists non-array chat-messages.json as unreadable', () => {
    const badDir = path.join(tempDataDir, 'chats', 'chat-not-array')
    fs.mkdirSync(badDir, { recursive: true })
    fs.writeFileSync(
      path.join(badDir, 'chat-messages.json'),
      '{"not":"an array"}',
    )

    const chats = getAllChats(500, tempDataDir)

    expect(chats).toHaveLength(1)
    expect(chats[0].chatId).toBe('chat-not-array')
    expect(chats[0].unreadable).toBe(true)
  })

  test('getAllChats prefers the chat-meta.json sidecar over parsing messages', () => {
    writeChat('chat-with-meta', 'prompt from messages file')
    const chatDir = path.join(tempDataDir, 'chats', 'chat-with-meta')
    const stats = fs.statSync(path.join(chatDir, 'chat-messages.json'))
    fs.writeFileSync(
      path.join(chatDir, 'chat-meta.json'),
      JSON.stringify({
        messageCount: 42,
        firstPrompt: 'prompt from meta',
        messagesSize: stats.size,
        messagesMtimeMs: stats.mtimeMs,
      }),
    )

    const chats = getAllChats(500, tempDataDir)

    expect(chats).toHaveLength(1)
    expect(chats[0].lastPrompt).toBe('prompt from meta')
    expect(chats[0].messageCount).toBe(42)
  })

  test('getAllChats falls back to parsing messages when meta is stale', () => {
    writeChat('chat-stale-meta', 'prompt from messages file')
    const chatDir = path.join(tempDataDir, 'chats', 'chat-stale-meta')
    // Sidecar recorded before the messages file was last rewritten: its
    // size/mtime no longer match, so it must be ignored
    fs.writeFileSync(
      path.join(chatDir, 'chat-meta.json'),
      JSON.stringify({
        messageCount: 42,
        firstPrompt: 'stale prompt from meta',
        messagesSize: 1,
        messagesMtimeMs: 1,
      }),
    )

    const chats = getAllChats(500, tempDataDir)

    expect(chats).toHaveLength(1)
    expect(chats[0].lastPrompt).toBe('prompt from messages file')
    expect(chats[0].messageCount).toBe(1)
  })

  test('getAllChats still flags a chat unreadable when messages are corrupted after the meta was written', () => {
    writeChat('chat-corrupt-after-meta', 'healthy prompt')
    const chatDir = path.join(tempDataDir, 'chats', 'chat-corrupt-after-meta')
    const messagesPath = path.join(chatDir, 'chat-messages.json')
    const stats = fs.statSync(messagesPath)
    fs.writeFileSync(
      path.join(chatDir, 'chat-meta.json'),
      JSON.stringify({
        messageCount: 1,
        firstPrompt: 'healthy prompt',
        messagesSize: stats.size,
        messagesMtimeMs: stats.mtimeMs,
      }),
    )
    // Transcript truncated later (crash mid-write by an older CLI, disk
    // issue): the sidecar no longer matches, so the corruption must not be
    // masked by it
    fs.writeFileSync(messagesPath, '[{"id":"msg-1","variant":"user","con')

    const chats = getAllChats(500, tempDataDir)

    expect(chats).toHaveLength(1)
    expect(chats[0].unreadable).toBe(true)
    expect(chats[0].lastPrompt).toBe('(unreadable chat)')
  })

  test('getAllChats falls back to parsing messages when meta is corrupt', () => {
    writeChat('chat-bad-meta', 'prompt from messages file')
    fs.writeFileSync(
      path.join(tempDataDir, 'chats', 'chat-bad-meta', 'chat-meta.json'),
      '{"messageCount": tru',
    )

    const chats = getAllChats(500, tempDataDir)

    expect(chats).toHaveLength(1)
    expect(chats[0].lastPrompt).toBe('prompt from messages file')
    expect(chats[0].messageCount).toBe(1)
    expect(chats[0].unreadable).toBeUndefined()
  })

  test('getAllChats still hides empty chats', () => {
    const emptyDir = path.join(tempDataDir, 'chats', 'chat-empty')
    fs.mkdirSync(emptyDir, { recursive: true })
    fs.writeFileSync(path.join(emptyDir, 'chat-messages.json'), '[]')

    expect(getAllChats(500, tempDataDir)).toHaveLength(0)
  })
  test('getChatsForProjects merges other project paths and sorts globally', () => {
    const projectAData = path.join(tempDataDir, 'project-a-data')
    const projectBData = path.join(tempDataDir, 'project-b-data')

    const writeProjectChat = (
      dataDir: string,
      chatId: string,
      prompt: string,
      mtimeMs: number,
    ) => {
      const chatDir = path.join(dataDir, 'chats', chatId)
      fs.mkdirSync(chatDir, { recursive: true })
      fs.writeFileSync(
        path.join(chatDir, 'chat-messages.json'),
        JSON.stringify([
          {
            id: `${chatId}-message`,
            variant: 'user',
            content: prompt,
            timestamp: new Date(mtimeMs).toISOString(),
            blocks: [],
          },
        ]),
      )
      const timestamp = new Date(mtimeMs)
      fs.utimesSync(chatDir, timestamp, timestamp)
    }

    writeProjectChat(projectAData, 'shared-id', 'older project prompt', 1000)
    writeProjectChat(projectBData, 'shared-id', 'newer project prompt', 2000)

    const chats = getChatsForProjects(
      [
        {
          projectPath: path.join(tempDataDir, 'project-a'),
          dataDir: projectAData,
        },
        {
          projectPath: path.join(tempDataDir, 'project-b'),
          dataDir: projectBData,
        },
      ],
      500,
    )

    expect(chats).toHaveLength(2)
    expect(chats.map((chat) => chat.lastPrompt)).toEqual([
      'newer project prompt',
      'older project prompt',
    ])
    expect(chats[0].projectName).toBe('project-b')
    expect(chats[0].dataDir).toBe(path.resolve(projectBData))
    expect(chats[1].projectName).toBe('project-a')
  })

  test('getChatsForProjects skips one unreadable source without hiding other projects', () => {
    const healthyData = path.join(tempDataDir, 'healthy-data')
    const brokenData = path.join(tempDataDir, 'broken-data')
    const healthyChatDir = path.join(healthyData, 'chats', 'healthy-chat')
    fs.mkdirSync(healthyChatDir, { recursive: true })
    fs.writeFileSync(
      path.join(healthyChatDir, 'chat-messages.json'),
      JSON.stringify([
        {
          id: 'healthy-message',
          variant: 'user',
          content: 'healthy project prompt',
          timestamp: new Date().toISOString(),
          blocks: [],
        },
      ]),
    )

    fs.mkdirSync(brokenData, { recursive: true })
    fs.writeFileSync(path.join(brokenData, 'chats'), 'not a directory')

    const chats = getChatsForProjects(
      [
        { projectPath: '/broken-project', dataDir: brokenData },
        { projectPath: '/healthy-project', dataDir: healthyData },
      ],
      500,
    )

    expect(chats).toHaveLength(1)
    expect(chats[0].chatId).toBe('healthy-chat')
    expect(chats[0].projectPath).toBe(path.resolve('/healthy-project'))
  })

  test('getChatsForProjects applies the global limit before reading entries', () => {
    const projectAData = path.join(tempDataDir, 'project-a-data')
    const projectBData = path.join(tempDataDir, 'project-b-data')

    const copyChat = (
      dataDir: string,
      chatId: string,
      prompt: string,
      mtimeMs: number,
    ) => {
      const chatDir = path.join(dataDir, 'chats', chatId)
      fs.mkdirSync(chatDir, { recursive: true })
      fs.writeFileSync(
        path.join(chatDir, 'chat-messages.json'),
        JSON.stringify([
          {
            id: `${chatId}-message`,
            variant: 'user',
            content: prompt,
            timestamp: new Date(mtimeMs).toISOString(),
            blocks: [],
          },
        ]),
      )
      const timestamp = new Date(mtimeMs)
      fs.utimesSync(chatDir, timestamp, timestamp)
    }

    copyChat(projectAData, 'chat-a', 'older', 1000)
    copyChat(projectBData, 'chat-b', 'newest', 3000)

    const chats = getChatsForProjects(
      [
        {
          projectPath: path.join(tempDataDir, 'project-a'),
          dataDir: projectAData,
        },
        {
          projectPath: path.join(tempDataDir, 'project-b'),
          dataDir: projectBData,
        },
      ],
      1,
    )

    expect(chats).toHaveLength(1)
    expect(chats[0].lastPrompt).toBe('newest')
  })
})
