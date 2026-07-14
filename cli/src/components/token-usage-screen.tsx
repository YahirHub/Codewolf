import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useRef, useState } from 'react'

import { getProjectRoot } from '../project-files'
import { useChatStore } from '../state/chat-store'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  clearTokenUsage,
  filterUsageByProject,
  groupTokenUsage,
  loadTokenUsageEvents,
  summarizeTokenUsage,
} from '../utils/token-usage'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'
import type { TokenUsageEvent } from '@codebuff/common/types/token-usage'

interface TokenUsageScreenProps {
  onClose: () => void
}

const NUMBER_FORMAT = new Intl.NumberFormat('es-MX')

function formatTokens(value: number): string {
  return NUMBER_FORMAT.format(Math.round(value))
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0
    ? `${minutes} min ${remainingSeconds} s`
    : `${minutes} min`
}

function measurementLabel(event: TokenUsageEvent): string {
  if (event.measurement === 'provider') return 'informada por el proveedor'
  if (event.measurement === 'mixed') return 'mixta: proveedor + cálculo local'
  return event.hasMultimodalContent
    ? 'calculada localmente, con estimación multimedia'
    : 'calculada localmente'
}

export const TokenUsageScreen: React.FC<TokenUsageScreenProps> = ({
  onClose,
}) => {
  const theme = useTheme()
  const { terminalHeight } = useTerminalDimensions()
  const screenHeight = Math.max(13, Math.min(25, terminalHeight - 3))
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const traceSessionId = useChatStore((state) => state.runState?.traceSessionId)
  const [events, setEvents] = useState(() => loadTokenUsageEvents())
  const [confirmClear, setConfirmClear] = useState(false)

  const projectPath = getProjectRoot()
  const sessionEvents = useMemo(
    () =>
      traceSessionId
        ? events.filter((event) => event.sessionId === traceSessionId)
        : [],
    [events, traceSessionId],
  )
  const projectEvents = useMemo(
    () => filterUsageByProject(events, projectPath),
    [events, projectPath],
  )

  const sessionTotals = useMemo(
    () => summarizeTokenUsage(sessionEvents),
    [sessionEvents],
  )
  const projectTotals = useMemo(
    () => summarizeTokenUsage(projectEvents),
    [projectEvents],
  )
  const globalTotals = useMemo(() => summarizeTokenUsage(events), [events])

  const modelGroups = useMemo(
    () =>
      groupTokenUsage(projectEvents, (event) => ({
        key: `${event.providerId}:${event.modelId}`,
        label: `${event.providerName} · ${event.modelId}`,
      })).slice(0, 8),
    [projectEvents],
  )
  const agentGroups = useMemo(
    () =>
      groupTokenUsage(sessionEvents, (event) => ({
        key: event.agentType ?? event.agentId ?? 'main',
        label:
          event.agentType ?? (event.agentId ? 'Subagente' : 'Agente principal'),
      })).slice(0, 8),
    [sessionEvents],
  )

  const latestEvent =
    sessionEvents.at(-1) ?? projectEvents.at(-1) ?? events.at(-1)

  const clearAll = useCallback(() => {
    clearTokenUsage()
    setEvents([])
    setConfirmClear(false)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (confirmClear) {
          if (isPlainEnterKey(key)) {
            clearAll()
            return
          }
          if (key.name === 'escape' || key.name === 'n') {
            setConfirmClear(false)
          }
          return
        }

        if (key.name === 'escape') {
          onClose()
          return
        }
        if (key.name === 'r') {
          setConfirmClear(true)
          return
        }

        const scrollbox = scrollRef.current
        if (!scrollbox) return
        if (key.name === 'up')
          scrollbox.scrollTop = Math.max(0, scrollbox.scrollTop - 1)
        if (key.name === 'down') scrollbox.scrollTop += 1
        if (key.name === 'pageup') {
          scrollbox.scrollTop = Math.max(
            0,
            scrollbox.scrollTop - Math.max(1, scrollbox.viewport.height - 1),
          )
        }
        if (key.name === 'pagedown') {
          scrollbox.scrollTop += Math.max(1, scrollbox.viewport.height - 1)
        }
      },
      [clearAll, confirmClear, onClose],
    ),
  )

  return (
    <box
      title=" Estadísticas locales de tokens "
      titleAlignment="center"
      style={{
        width: '100%',
        height: screenHeight,
        maxHeight: screenHeight,
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <scrollbox
        ref={scrollRef}
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{ visible: true, trackOptions: { width: 1 } }}
        style={{
          flexGrow: 1,
          rootOptions: { flexDirection: 'row', backgroundColor: 'transparent' },
          wrapperOptions: {
            border: false,
            backgroundColor: 'transparent',
            flexDirection: 'column',
          },
          contentOptions: {
            flexDirection: 'column',
            backgroundColor: 'transparent',
          },
        }}
      >
        <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
          Sesión actual
        </text>
        {sessionTotals.requests > 0 ? (
          <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
            <text style={{ fg: theme.foreground }}>
              Entrada: {formatTokens(sessionTotals.inputTokens)} · Salida:{' '}
              {formatTokens(sessionTotals.outputTokens)} · Total:{' '}
              {formatTokens(sessionTotals.totalTokens)}
            </text>
            <text style={{ fg: theme.muted }}>
              {sessionTotals.requests} llamadas · {sessionTotals.successful}{' '}
              correctas · {sessionTotals.failed} con error · tiempo de modelo{' '}
              {formatDuration(sessionTotals.durationMs)}
            </text>
          </box>
        ) : (
          <text style={{ fg: theme.muted, paddingLeft: 1 }}>
            Todavía no hay llamadas registradas en esta conversación.
          </text>
        )}

        <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
          Proyecto actual
        </text>
        <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
          <text style={{ fg: theme.foreground }}>
            Entrada: {formatTokens(projectTotals.inputTokens)} · Salida:{' '}
            {formatTokens(projectTotals.outputTokens)} · Total:{' '}
            {formatTokens(projectTotals.totalTokens)}
          </text>
          <text style={{ fg: theme.muted }}>
            {projectTotals.requests} llamadas · {projectTotals.providerMeasured}{' '}
            informadas · {projectTotals.mixedMeasured} mixtas ·{' '}
            {projectTotals.locallyCalculated} calculadas localmente
          </text>
        </box>

        <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
          Acumulado local
        </text>
        <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
          <text style={{ fg: theme.foreground }}>
            Entrada: {formatTokens(globalTotals.inputTokens)} · Salida:{' '}
            {formatTokens(globalTotals.outputTokens)} · Total:{' '}
            {formatTokens(globalTotals.totalTokens)}
          </text>
          <text style={{ fg: theme.muted }}>
            {globalTotals.requests} llamadas guardadas durante un máximo de 90
            días
          </text>
        </box>

        {latestEvent && (
          <box style={{ flexDirection: 'column' }}>
            <text
              style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}
            >
              Última llamada
            </text>
            <text style={{ fg: theme.foreground, paddingLeft: 1 }}>
              {latestEvent.providerName} · {latestEvent.modelId} ·{' '}
              {formatTokens(latestEvent.inputTokens)} entrada ·{' '}
              {formatTokens(latestEvent.outputTokens)} salida
            </text>
            <text style={{ fg: theme.muted, paddingLeft: 1 }}>
              Medición {measurementLabel(latestEvent)}
            </text>
          </box>
        )}

        {agentGroups.length > 0 && (
          <box style={{ flexDirection: 'column' }}>
            <text
              style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}
            >
              Uso por agente en esta sesión
            </text>
            {agentGroups.map((group) => (
              <text
                key={group.key}
                style={{ fg: theme.foreground, paddingLeft: 1 }}
              >
                {group.label}: {formatTokens(group.totalTokens)} tokens ·{' '}
                {group.requests} llamadas
              </text>
            ))}
          </box>
        )}

        {modelGroups.length > 0 && (
          <box style={{ flexDirection: 'column' }}>
            <text
              style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}
            >
              Uso por modelo en este proyecto
            </text>
            {modelGroups.map((group) => (
              <text
                key={group.key}
                style={{ fg: theme.foreground, paddingLeft: 1 }}
              >
                {group.label}: {formatTokens(group.totalTokens)} tokens ·{' '}
                {group.requests} llamadas
              </text>
            ))}
          </box>
        )}

        <text style={{ fg: theme.muted }}>
          Solo se guardan cifras y metadatos técnicos; nunca prompts, respuestas
          ni claves.
        </text>
      </scrollbox>

      {confirmClear ? (
        <text style={{ fg: theme.warning }}>
          ¿Eliminar todas las estadísticas? Enter confirmar · Esc cancelar
        </text>
      ) : (
        <text style={{ fg: theme.muted }}>
          ↑↓ desplazarse · R limpiar estadísticas · Esc cerrar
        </text>
      )}
    </box>
  )
}
