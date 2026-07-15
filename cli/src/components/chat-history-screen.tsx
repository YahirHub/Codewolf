import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { useSearchableList } from '../hooks/use-searchable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import {
  deleteChatSession,
  formatRelativeTime,
  getAllProjectChats,
  getChatsForProjects,
} from '../utils/chat-history'
import { getProjectDataDirForRoot, getProjectRoot } from '../project-files'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { ProjectChatHistoryEntry } from '../utils/chat-history'
import type { SelectableListItem } from './selectable-list'

const LAYOUT = {
  CONTENT_PADDING: 4,
  COMPACT_MODE_THRESHOLD: 20,
  NARROW_WIDTH_THRESHOLD: 70,
  INITIAL_CHATS: 25,
  BACKGROUND_CHATS: 475,
  MAX_RENDERED_CHATS: 500,
  TIME_COL_WIDTH: 12,
  MSGS_COL_WIDTH: 8,
  DELETE_COL_WIDTH: 6,
  GAP_WIDTH: 3,
  MIN_PROJECT_COL_WIDTH: 18,
  MAX_PROJECT_COL_WIDTH: 42,
  MIN_PROMPT_WIDTH: 16,
} as const

export interface ChatHistorySelection {
  chatId: string
  projectPath: string
}

type HistoryScope = 'current' | 'all'

interface ChatHistoryScreenProps {
  onSelectChat: (selection: ChatHistorySelection) => void | Promise<void>
  onCancel: () => void
  onNewChat: () => void
}

export function createHistoryItemId(
  projectPath: string,
  chatId: string,
): string {
  return JSON.stringify([projectPath, chatId])
}

export const ChatHistoryScreen: React.FC<ChatHistoryScreenProps> = ({
  onSelectChat,
  onCancel,
  onNewChat,
}) => {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()
  const currentProjectPath = getProjectRoot()
  const currentProjectSource = useMemo(
    () => ({
      projectPath: currentProjectPath,
      dataDir: getProjectDataDirForRoot(currentProjectPath),
    }),
    [currentProjectPath],
  )

  const [historyScope, setHistoryScope] = useState<HistoryScope>('current')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const loadChats = useCallback(
    (maxChats: number) =>
      historyScope === 'current'
        ? getChatsForProjects([currentProjectSource], maxChats)
        : getAllProjectChats(maxChats, currentProjectPath),
    [currentProjectPath, currentProjectSource, historyScope],
  )

  const [chats, setChats] = useState<ProjectChatHistoryEntry[]>(() =>
    getChatsForProjects([currentProjectSource], LAYOUT.INITIAL_CHATS),
  )

  useEffect(() => {
    setChats(loadChats(LAYOUT.INITIAL_CHATS))
    const timer = setTimeout(() => {
      setChats(loadChats(LAYOUT.INITIAL_CHATS + LAYOUT.BACKGROUND_CHATS))
    }, 0)
    return () => clearTimeout(timer)
  }, [loadChats])

  const contentWidth = terminalWidth - LAYOUT.CONTENT_PADDING
  const showProjectColumn = historyScope === 'all'
  const projectColumnWidth = showProjectColumn
    ? Math.max(
        LAYOUT.MIN_PROJECT_COL_WIDTH,
        Math.min(LAYOUT.MAX_PROJECT_COL_WIDTH, Math.floor(contentWidth * 0.3)),
      )
    : 0
  const gapCount = showProjectColumn ? 3 : 2
  const reservedWidth =
    LAYOUT.TIME_COL_WIDTH +
    LAYOUT.MSGS_COL_WIDTH +
    LAYOUT.DELETE_COL_WIDTH +
    LAYOUT.GAP_WIDTH * gapCount +
    projectColumnWidth +
    5
  const maxPromptWidth = Math.max(
    LAYOUT.MIN_PROMPT_WIDTH,
    contentWidth - reservedWidth,
  )

  const truncateText = useCallback((text: string, maxLen: number): string => {
    const singleLine = text.replace(/\n/g, ' ').trim()
    if (singleLine.length <= maxLen) return singleLine
    return singleLine.slice(0, Math.max(1, maxLen - 1)) + '…'
  }, [])

  const padRight = useCallback((text: string, width: number): string => {
    const len = Array.from(text).length
    if (len >= width) return text
    return text + ' '.repeat(width - len)
  }, [])

  const chatByItemId = useMemo(
    () =>
      new Map(
        chats.map((chat) => [
          createHistoryItemId(chat.projectPath, chat.chatId),
          chat,
        ]),
      ),
    [chats],
  )

  const chatItems: SelectableListItem[] = useMemo(
    () =>
      chats.map((chat) => {
        const time = padRight(
          formatRelativeTime(chat.timestamp),
          LAYOUT.TIME_COL_WIDTH,
        )
        const msgs = padRight(
          chat.unreadable ? '—' : `${chat.messageCount} msjs.`,
          LAYOUT.MSGS_COL_WIDTH,
        )
        const displayName = chat.name ?? chat.lastPrompt
        const prompt = padRight(
          truncateText(displayName, maxPromptWidth),
          maxPromptWidth,
        )
        const project = showProjectColumn
          ? padRight(
              truncateText(chat.projectPath, projectColumnWidth),
              projectColumnWidth,
            )
          : ''
        const columns = showProjectColumn
          ? [time, msgs, project, prompt]
          : [time, msgs, prompt]

        return {
          id: createHistoryItemId(chat.projectPath, chat.chatId),
          label: columns.join(' '.repeat(LAYOUT.GAP_WIDTH)),
          icon: undefined,
          secondary: [
            chat.name,
            chat.lastPrompt,
            chat.projectName,
            chat.projectPath,
          ]
            .filter(Boolean)
            .join(' '),
          hideSecondary: true,
          accent: chat.projectPath === currentProjectPath && showProjectColumn,
        }
      }),
    [
      chats,
      currentProjectPath,
      maxPromptWidth,
      padRight,
      projectColumnWidth,
      showProjectColumn,
      truncateText,
    ],
  )

  const filterByPromptOrProject = useCallback(
    (item: SelectableListItem, query: string) =>
      (item.secondary ?? '').toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems,
    handleFocusChange,
  } = useSearchableList({
    items: chatItems,
    resetKey: historyScope,
    filterFn: filterByPromptOrProject,
    filterPathQueries: true,
  })

  const isCompactMode = terminalHeight < LAYOUT.COMPACT_MODE_THRESHOLD
  const isNarrowWidth = terminalWidth < LAYOUT.NARROW_WIDTH_THRESHOLD

  const switchScope = useCallback(
    (scope?: HistoryScope) => {
      setHistoryScope(
        (current) => scope ?? (current === 'current' ? 'all' : 'current'),
      )
      setSearchQuery('')
      setFocusedIndex(0)
      setStatusMessage(null)
    },
    [setFocusedIndex, setSearchQuery],
  )

  const handleDeleteChat = useCallback(
    (itemId: string) => {
      const chat = chatByItemId.get(itemId)
      if (!chat) {
        setStatusMessage('No se encontró el chat seleccionado')
        return
      }

      const deleted = deleteChatSession(chat.chatId, chat.dataDir)
      if (deleted) {
        setChats((previous) =>
          previous.filter(
            (entry) =>
              createHistoryItemId(entry.projectPath, entry.chatId) !== itemId,
          ),
        )
        setStatusMessage('Chat eliminado')
        return
      }

      setStatusMessage('No se pudo eliminar el chat')
    },
    [chatByItemId],
  )

  const selectChat = useCallback(
    (itemId: string) => {
      const chat = chatByItemId.get(itemId)
      if (!chat) {
        setStatusMessage('No se encontró el chat seleccionado')
        return
      }
      if (chat.unreadable) {
        setStatusMessage('El archivo del chat está dañado y no se puede abrir')
        return
      }

      Promise.resolve(
        onSelectChat({
          chatId: chat.chatId,
          projectPath: chat.projectPath,
        }),
      ).catch((error) => {
        setStatusMessage(
          error instanceof Error
            ? `No se pudo abrir el proyecto: ${error.message}`
            : 'No se pudo abrir el proyecto seleccionado',
        )
      })
    },
    [chatByItemId, onSelectChat],
  )

  const handleChatSelect = useCallback(
    (item: SelectableListItem) => {
      selectChat(item.id)
    },
    [selectChat],
  )

  const handleChatDelete = useCallback(
    (item: SelectableListItem) => {
      handleDeleteChat(item.id)
    },
    [handleDeleteChat],
  )

  const handleKeyIntercept = useCallback(
    (key: {
      name?: string
      sequence?: string
      shift?: boolean
      ctrl?: boolean
      meta?: boolean
      option?: boolean
    }) => {
      if (key.name === 'tab' && !key.ctrl && !key.meta && !key.option) {
        switchScope()
        return true
      }
      if (key.name === 'escape') {
        if (searchQuery.length > 0) {
          setSearchQuery('')
        } else {
          onCancel()
        }
        return true
      }
      if (key.name === 'up') {
        setFocusedIndex((previous) => Math.max(0, previous - 1))
        return true
      }
      if (key.name === 'down') {
        const maxIndex =
          Math.min(filteredItems.length, LAYOUT.MAX_RENDERED_CHATS) - 1
        setFocusedIndex((previous) => Math.min(maxIndex, previous + 1))
        return true
      }
      if (isPlainEnterKey(key)) {
        const focused = filteredItems[focusedIndex]
        if (focused) {
          selectChat(focused.id)
        }
        return true
      }
      if (key.name === 'c' && key.ctrl) {
        onCancel()
        return true
      }
      return false
    },
    [
      filteredItems,
      focusedIndex,
      onCancel,
      searchQuery.length,
      selectChat,
      setFocusedIndex,
      setSearchQuery,
      switchScope,
    ],
  )

  const emptyMessage =
    chats.length === 0
      ? historyScope === 'current'
        ? 'Aún no hay historial en este proyecto'
        : 'No hay chats guardados en los proyectos conocidos'
      : searchQuery
        ? 'No hay chats coincidentes'
        : 'No se encontraron chats'

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: isCompactMode ? 0 : 1,
          paddingBottom: 0,
          gap: 0,
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        {!isCompactMode && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 1,
              marginTop: 1,
              flexShrink: 0,
            }}
          >
            <text
              style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
            >
              Selecciona un chat para reanudarlo
            </text>
            <box style={{ flexDirection: 'row', gap: 2 }}>
              <Button onClick={() => switchScope('current')}>
                <text
                  style={{
                    fg:
                      historyScope === 'current' ? theme.primary : theme.muted,
                    attributes:
                      historyScope === 'current'
                        ? TextAttributes.BOLD
                        : undefined,
                  }}
                >
                  {historyScope === 'current'
                    ? '[Proyecto actual]'
                    : 'Proyecto actual'}
                </text>
              </Button>
              <Button onClick={() => switchScope('all')}>
                <text
                  style={{
                    fg: historyScope === 'all' ? theme.primary : theme.muted,
                    attributes:
                      historyScope === 'all' ? TextAttributes.BOLD : undefined,
                  }}
                >
                  {historyScope === 'all'
                    ? '[Todos los proyectos]'
                    : 'Todos los proyectos'}
                </text>
              </Button>
              <text style={{ fg: theme.muted }}>Tab cambia la vista</text>
            </box>
          </box>
        )}

        <box
          style={{
            width: contentWidth,
            flexShrink: 0,
            marginBottom: 0,
          }}
        >
          <MultilineInput
            value={searchQuery}
            onChange={({ text }) => setSearchQuery(text)}
            onSubmit={() => {}}
            onPaste={() => {}}
            onKeyIntercept={handleKeyIntercept}
            placeholder={
              historyScope === 'current'
                ? 'Buscar chats...'
                : 'Buscar chats, proyectos o rutas...'
            }
            focused={true}
            maxHeight={1}
            minHeight={1}
            cursorPosition={searchQuery.length}
          />
        </box>

        <box
          style={{
            flexDirection: 'column',
            width: contentWidth,
            borderStyle: 'single',
            borderColor: theme.muted,
            flexGrow: 1,
            flexShrink: 1,
            overflow: 'hidden',
          }}
          border={['top', 'bottom', 'left', 'right']}
        >
          <SelectableList
            items={filteredItems.slice(0, LAYOUT.MAX_RENDERED_CHATS)}
            focusedIndex={focusedIndex}
            onSelect={handleChatSelect}
            actionLabel="[×]"
            onAction={handleChatDelete}
            onFocusChange={handleFocusChange}
            emptyMessage={emptyMessage}
          />
        </box>
      </box>

      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          borderStyle: 'single',
          borderColor: theme.border,
          flexShrink: 0,
          backgroundColor: theme.surface,
        }}
        border={['top']}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: contentWidth,
          }}
        >
          <box style={{ flexGrow: 1, flexShrink: 1 }}>
            <text style={{ fg: theme.muted }}>
              ↑↓ navegar · Enter reanudar · Tab cambiar vista · [×] eliminar ·
              Esc cancelar
            </text>
            {statusMessage && (
              <text style={{ fg: theme.muted }}>
                {' · '}
                {statusMessage}
              </text>
            )}
          </box>

          {!isNarrowWidth && (
            <box style={{ flexDirection: 'row', gap: 1 }}>
              <Button
                onClick={onNewChat}
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 0,
                  paddingBottom: 0,
                  borderStyle: 'single',
                  borderColor: theme.primary,
                }}
                border={['top', 'bottom', 'left', 'right']}
              >
                <text style={{ fg: theme.primary }}>Chat nuevo</text>
              </Button>
              <Button
                onClick={onCancel}
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 0,
                  paddingBottom: 0,
                  borderStyle: 'single',
                  borderColor: theme.muted,
                }}
                border={['top', 'bottom', 'left', 'right']}
              >
                <text style={{ fg: theme.muted }}>Cancelar</text>
              </Button>
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
