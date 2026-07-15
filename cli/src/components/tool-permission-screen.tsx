import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ToolPermissionRequest } from '@codebuff/common/types/tool-permission'
import type { KeyEvent } from '@opentui/core'

interface ToolPermissionScreenProps {
  request: ToolPermissionRequest
  onAllow: () => void
  onDeny: () => void
}

const OPTIONS = [
  {
    id: 'allow' as const,
    label: 'PERMITIR ESTA VEZ',
    hint: 'Ejecuta únicamente esta operación. La siguiente volverá a pedir permiso.',
  },
  {
    id: 'deny' as const,
    label: 'RECHAZAR',
    hint: 'No ejecuta la operación y comunica el rechazo al modelo.',
  },
]

const categoryLabel: Record<ToolPermissionRequest['category'], string> = {
  command: 'Comando del sistema',
  'file-create': 'Creación de archivo',
  'file-edit': 'Edición de archivo',
  'file-delete': 'Eliminación de archivo',
  'external-tool': 'Herramienta externa o MCP',
}

export const ToolPermissionScreen: React.FC<ToolPermissionScreenProps> = ({
  request,
  onAllow,
  onDeny,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [request.toolCallId])
  const select = useCallback(
    (id: (typeof OPTIONS)[number]['id']) => {
      if (id === 'allow') onAllow()
      else onDeny()
    },
    [onAllow, onDeny],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape' || key.name === 'n') {
          onDeny()
          return
        }
        if (key.name === 'y') {
          onAllow()
          return
        }
        if (
          key.name === 'left' ||
          key.name === 'right' ||
          key.name === 'tab' ||
          key.name === 'up' ||
          key.name === 'down'
        ) {
          setSelectedIndex((current) => (current === 0 ? 1 : 0))
          return
        }
        if (isPlainEnterKey(key)) {
          const selected = OPTIONS[selectedIndex]
          if (selected) select(selected.id)
        }
      },
      [onAllow, onDeny, select, selectedIndex],
    ),
  )

  return (
    <box
      title=" Modo seguro · Permiso requerido "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.warning,
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        El modelo solicita permiso para: {request.title}
      </text>
      <text style={{ fg: theme.muted }}>
        Tipo: {categoryLabel[request.category]} · Herramienta:{' '}
        {request.toolName}
      </text>
      <text style={{ fg: theme.muted }}>
        Agente: {request.agentId}
        {request.parentAgentId
          ? ` · Subagente de ${request.parentAgentId}`
          : ''}
      </text>

      {(request.target || request.preview) && (
        <box
          style={{
            marginTop: 1,
            paddingLeft: 1,
            paddingRight: 1,
            borderStyle: 'single',
            borderColor: theme.border,
            flexDirection: 'column',
          }}
        >
          {request.target && (
            <text style={{ fg: theme.foreground, wrapMode: 'word' }}>
              {request.target}
            </text>
          )}
          {request.preview && (
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              {request.preview}
            </text>
          )}
        </box>
      )}

      <text style={{ fg: theme.foreground, marginTop: 1, wrapMode: 'word' }}>
        Motivo: {request.reason}
      </text>

      <box style={{ flexDirection: 'row', gap: 1, marginTop: 1 }}>
        {OPTIONS.map((option, index) => {
          const selected = selectedIndex === index
          const allow = option.id === 'allow'
          return (
            <Button
              key={option.id}
              onClick={() => select(option.id)}
              onMouseOver={() => setSelectedIndex(index)}
              style={{
                flexDirection: 'column',
                paddingLeft: 2,
                paddingRight: 2,
                borderStyle: 'single',
                borderColor: selected
                  ? allow
                    ? theme.success
                    : theme.error
                  : theme.secondary,
                backgroundColor:
                  selected && allow ? theme.surfaceHover : 'transparent',
                customBorderChars: BORDER_CHARS,
              }}
            >
              <text
                style={{
                  fg: allow ? theme.success : theme.error,
                  attributes: selected
                    ? TextAttributes.BOLD
                    : TextAttributes.NONE,
                }}
              >
                {selected ? '❯ ' : '  '}
                {option.label}
              </text>
              <text style={{ fg: theme.muted }}>{option.hint}</text>
            </Button>
          )
        })}
      </box>

      <text style={{ fg: theme.muted, marginTop: 1 }}>
        ←/→ o Tab: elegir · Enter: confirmar · Y: permitir · N/Esc: rechazar
      </text>
    </box>
  )
}
