import { TextAttributes, type KeyEvent } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { listRewindCheckpoints } from '../utils/rewind-checkpoints'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { BORDER_CHARS } from '../utils/ui-constants'

import type {
  RewindCheckpointSummary,
  RewindRestoreMode,
} from '../utils/rewind-checkpoints'

const ACTIONS: Array<{
  mode: RewindRestoreMode
  label: string
  description: string
}> = [
  {
    mode: 'both',
    label: 'Restaurar conversación y archivos',
    description: 'Vuelve el chat y los archivos editados por Codewolf.',
  },
  {
    mode: 'conversation',
    label: 'Restaurar solo la conversación',
    description: 'Conserva los archivos actuales y vuelve el contexto del chat.',
  },
  {
    mode: 'files',
    label: 'Restaurar solo los archivos',
    description: 'Conserva el chat actual y revierte los archivos rastreados.',
  },
]

type RewindScreenProps = {
  chatDir: string
  onRestore: (
    checkpointId: string,
    mode: RewindRestoreMode,
  ) => void | Promise<void>
  onCancel: () => void
}

function formatCheckpointTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
}

function truncate(value: string, maxLength: number): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  return singleLine.length <= maxLength
    ? singleLine
    : `${singleLine.slice(0, Math.max(1, maxLength - 1))}…`
}

export const RewindScreen: React.FC<RewindScreenProps> = ({
  chatDir,
  onRestore,
  onCancel,
}) => {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()
  const [checkpoints, setCheckpoints] = useState<RewindCheckpointSummary[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    listRewindCheckpoints(chatDir)
      .then((items) => {
        if (!active) return
        setCheckpoints([...items].reverse())
        setSelectedIndex(0)
      })
      .catch((loadError) => {
        if (!active) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudieron cargar los puntos de restauración.',
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [chatDir])

  const selectedCheckpoint = useMemo(
    () =>
      selectedCheckpointId
        ? checkpoints.find((item) => item.id === selectedCheckpointId)
        : checkpoints[selectedIndex],
    [checkpoints, selectedCheckpointId, selectedIndex],
  )

  const selectCurrentCheckpoint = useCallback(() => {
    const checkpoint = checkpoints[selectedIndex]
    if (!checkpoint) return
    setSelectedCheckpointId(checkpoint.id)
    setActionIndex(0)
    setError(null)
  }, [checkpoints, selectedIndex])

  const restoreSelected = useCallback(async () => {
    if (!selectedCheckpoint || isRestoring) return
    const action = ACTIONS[actionIndex]
    if (!action) return
    setIsRestoring(true)
    setError(null)
    try {
      await onRestore(selectedCheckpoint.id, action.mode)
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : 'No se pudo restaurar el punto seleccionado.',
      )
      setIsRestoring(false)
    }
  }, [actionIndex, isRestoring, onRestore, selectedCheckpoint])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape' && !isRestoring) {
          if (selectedCheckpointId) {
            setSelectedCheckpointId(null)
            setError(null)
          } else {
            onCancel()
          }
          return
        }
        if (isLoading || isRestoring) return

        if (selectedCheckpointId) {
          if (key.name === 'up') {
            setActionIndex((current) => Math.max(0, current - 1))
            return
          }
          if (key.name === 'down') {
            setActionIndex((current) =>
              Math.min(ACTIONS.length - 1, current + 1),
            )
            return
          }
          if (isPlainEnterKey(key)) void restoreSelected()
          return
        }

        if (key.name === 'up') {
          setSelectedIndex((current) => Math.max(0, current - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((current) =>
            Math.min(checkpoints.length - 1, current + 1),
          )
          return
        }
        if (isPlainEnterKey(key)) selectCurrentCheckpoint()
      },
      [
        checkpoints.length,
        isLoading,
        isRestoring,
        onCancel,
        restoreSelected,
        selectCurrentCheckpoint,
        selectedCheckpointId,
      ],
    ),
  )

  const maxPromptWidth = Math.max(28, terminalWidth - 31)
  const maxVisible = Math.max(5, Math.min(14, terminalHeight - 9))
  const windowStart = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, checkpoints.length - maxVisible),
    ),
  )
  const visibleCheckpoints = checkpoints.slice(
    windowStart,
    windowStart + maxVisible,
  )

  return (
    <box
      title=" Rewind "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {isLoading ? (
        <text style={{ fg: theme.muted }}>Cargando puntos de restauración…</text>
      ) : checkpoints.length === 0 ? (
        <>
          <text style={{ fg: theme.warning }}>
            Todavía no hay puntos de restauración en esta conversación.
          </text>
          <text style={{ fg: theme.muted }}>
            Codewolf crea uno antes de cada nueva solicitud del usuario.
          </text>
        </>
      ) : selectedCheckpointId && selectedCheckpoint ? (
        <>
          <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
            Volver antes de:
          </text>
          <text style={{ fg: theme.foreground }}>
            {truncate(selectedCheckpoint.prompt, maxPromptWidth)}
          </text>
          <text style={{ fg: theme.muted }}>
            {formatCheckpointTime(selectedCheckpoint.createdAt)} ·{' '}
            {selectedCheckpoint.fileCount} archivos rastreados
          </text>
          {ACTIONS.map((action, index) => {
            const selected = index === actionIndex
            return (
              <box key={action.mode} style={{ flexDirection: 'column' }}>
                <text
                  style={{
                    fg: selected ? theme.info : theme.foreground,
                    bg: selected ? theme.surface : undefined,
                  }}
                >
                  {selected ? '❯ ' : '  '}
                  {action.label}
                </text>
                {selected && (
                  <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                    {action.description}
                  </text>
                )}
              </box>
            )
          })}
        </>
      ) : (
        <>
          <text style={{ fg: theme.secondary }}>
            Selecciona el mensaje al que quieres volver:
          </text>
          {visibleCheckpoints.map((checkpoint, visibleIndex) => {
            const index = windowStart + visibleIndex
            const selected = index === selectedIndex
            return (
              <text
                key={checkpoint.id}
                style={{
                  fg: selected ? theme.info : theme.foreground,
                  bg: selected ? theme.surface : undefined,
                }}
              >
                {selected ? '❯ ' : '  '}
                {formatCheckpointTime(checkpoint.createdAt)} ·{' '}
                {truncate(checkpoint.prompt, maxPromptWidth)}
              </text>
            )
          })}
        </>
      )}
      {error && <text style={{ fg: theme.error }}>{error}</text>}
      {isRestoring && (
        <text style={{ fg: theme.warning }}>Restaurando de forma segura…</text>
      )}
      <text style={{ fg: theme.muted }}>
        ↑↓ navegar · Enter seleccionar · Esc volver/cancelar
      </text>
      <text style={{ fg: theme.muted }}>
        Solo se restauran cambios hechos con write_file, str_replace y
        apply_patch.
      </text>
    </box>
  )
}
