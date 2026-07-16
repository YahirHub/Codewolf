import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'

import { useChatStore } from '../state/chat-store'
import { useCustomProviderStore } from '../state/custom-provider-store'
import { useTheme } from '../hooks/use-theme'
import {
  formatContextTokens,
  getContextWindowProgress,
} from '../utils/context-window'
import { resolveCustomModelMaxContextTokens } from '../utils/custom-providers'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StatusIndicatorState } from '../utils/status-indicator-state'

const StatusActionButton = ({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Button
      style={{ paddingLeft: 1, paddingRight: 1 }}
      onClick={onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text>
        <span
          fg={theme.secondary}
          attributes={hovered ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {children}
        </span>
      </text>
    </Button>
  )
}

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  timerStartTime: number | null
  isAtBottom: boolean
  scrollToLatest: () => void
  statusIndicatorState: StatusIndicatorState
  onStop?: () => void
}

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
  onStop,
}: StatusBarProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const customProviderConfig = useCustomProviderStore((state) => state.config)
  const activeCustomProvider = customProviderConfig.providers.find(
    (provider) => provider.id === customProviderConfig.activeProviderId,
  )
  const activeCustomModel =
    activeCustomProvider?.models.find(
      (model) => model.id === customProviderConfig.activeModelId,
    ) ?? activeCustomProvider?.models[0]
  const customProviderLabel = activeCustomProvider
    ? `${activeCustomProvider.name}/${activeCustomModel?.name ?? activeCustomModel?.id ?? 'sin-modelo'}`
    : null
  const contextTokenCount = useChatStore((state) => state.contextTokenCount)
  const maxContextTokens = activeCustomModel
    ? resolveCustomModelMaxContextTokens(activeCustomModel)
    : null
  const contextProgress = maxContextTokens
    ? getContextWindowProgress(contextTokenCount, maxContextTokens)
    : null
  const contextLabel = contextProgress
    ? `Contexto ${formatContextTokens(contextProgress.usedTokens)}/${formatContextTokens(contextProgress.maxTokens)} · ${contextProgress.usedPercent}%`
    : null

  const shouldShowTimer =
    statusIndicatorState.kind === 'waiting' ||
    statusIndicatorState.kind === 'streaming' ||
    statusIndicatorState.kind === 'paused'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - timerStartTime) / 1000))
    }

    updateElapsed()
    if (statusIndicatorState.kind === 'paused') return

    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [timerStartTime, shouldShowTimer, statusIndicatorState.kind])

  const statusIndicatorContent = (() => {
    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return <span fg={theme.secondary}>Pulsa Ctrl+C otra vez para salir</span>
      case 'clipboard':
        return (
          <span
            fg={
              statusIndicatorState.message.includes('Comentarios enviados')
                ? theme.success
                : theme.primary
            }
          >
            {statusIndicatorState.message}
          </span>
        )
      case 'reconnected':
        return <span fg={theme.success}>Reconectado</span>
      case 'retrying':
        return <ShimmerText text="reintentando..." primaryColor={theme.warning} />
      case 'connecting':
        return <ShimmerText text="conectando..." />
      case 'waiting':
        return (
          <ShimmerText
            text="trabajando..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )
      case 'streaming':
        return (
          <ShimmerText
            text="trabajando..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )
      case 'paused':
      case 'idle':
        return null
    }
  })()

  const elapsedTimeContent =
    shouldShowTimer && elapsedSeconds > 0 ? (
      <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
    ) : null
  const hasContent = Boolean(
    statusIndicatorContent ||
      elapsedTimeContent ||
      customProviderLabel ||
      contextLabel,
  )
  const contextColor =
    contextProgress?.level === 'critical'
      ? theme.error
      : contextProgress?.level === 'warning'
        ? theme.warning
        : theme.secondary

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        backgroundColor: hasContent ? theme.surface : 'transparent',
      }}
    >
      {contextProgress && (
        <box
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${contextProgress.remainingFraction * 100}%`,
            backgroundColor:
              contextProgress.level === 'critical'
                ? theme.error
                : contextProgress.level === 'warning'
                  ? theme.warning
                  : theme.surfaceHover,
          }}
        />
      )}
      <box style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
        <text style={{ wrapMode: 'none' }}>{statusIndicatorContent}</text>
      </box>

      <box style={{ flexShrink: 0 }}>
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToLatest} />}
      </box>

      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {customProviderLabel && (
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.secondary}>{customProviderLabel}</span>
          </text>
        )}
        {contextLabel && (
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={contextColor}
              attributes={
                contextProgress?.level === 'critical'
                  ? TextAttributes.BOLD
                  : TextAttributes.NONE
              }
            >
              {contextLabel}
              {contextProgress && contextProgress.usedPercent >= 80
                ? ' · /compact'
                : ''}
            </span>
          </text>
        )}
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
        {onStop &&
          (statusIndicatorState.kind === 'waiting' ||
            statusIndicatorState.kind === 'streaming') && (
            <StatusActionButton onClick={onStop}>■ Esc</StatusActionButton>
          )}
      </box>
    </box>
  )
}
