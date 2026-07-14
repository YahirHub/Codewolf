import path from 'path'

import {
  getCurrentChatDir,
  getCurrentChatId,
  getProjectDataDir,
} from '../project-files'
import {
  readChatSessionName,
  setChatSessionName,
} from './chat-meta'

export function getCurrentSessionName(): string | undefined {
  return readChatSessionName(getCurrentChatDir())
}

export function renameCurrentSession(name: string): string {
  return setChatSessionName(getCurrentChatDir(), name)
}

export function getSessionNameById(chatId: string): string | undefined {
  return readChatSessionName(
    path.join(getProjectDataDir(), 'chats', path.basename(chatId)),
  )
}

export function renameSessionById(chatId: string, name: string): string {
  const safeId = path.basename(chatId.trim())
  if (!safeId || safeId !== chatId.trim()) {
    throw new Error('El identificador de la sesión no es válido.')
  }
  return setChatSessionName(
    path.join(getProjectDataDir(), 'chats', safeId),
    name,
  )
}

export function getCurrentSessionIdentity(): {
  chatId: string
  name?: string
} {
  return {
    chatId: getCurrentChatId(),
    name: getCurrentSessionName(),
  }
}
