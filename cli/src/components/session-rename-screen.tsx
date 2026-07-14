import { TextAttributes } from '@opentui/core'
import React, { useCallback, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { getCurrentSessionName, renameCurrentSession } from '../utils/session-name'

import type { InputValue } from '../types/store'
import type { KeyEvent } from '@opentui/core'

interface SessionRenameScreenProps {
  onComplete: (name: string) => void
  onCancel: () => void
}

export const SessionRenameScreen: React.FC<SessionRenameScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const theme = useTheme()
  const initialName = getCurrentSessionName() ?? ''
  const [value, setValue] = useState<InputValue>({
    text: initialName,
    cursorPosition: initialName.length,
    lastEditDueToNav: false,
  })
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(() => {
    try {
      const name = renameCurrentSession(value.text)
      onComplete(name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [onComplete, value.text])

  const handleKeyIntercept = useCallback(
    (key: KeyEvent) => {
      if (key.name === 'escape') {
        onCancel()
        return true
      }
      return false
    },
    [onCancel],
  )

  return (
    <box
      title=" Renombrar sesión "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        Nombre visible de la conversación
      </text>
      <box
        style={{
          borderStyle: 'single',
          borderColor: error ? theme.error : theme.primary,
          paddingLeft: 1,
          paddingRight: 1,
          marginTop: 1,
        }}
      >
        <MultilineInput
          value={value.text}
          cursorPosition={value.cursorPosition}
          onChange={(next) => {
            setValue(next)
            setError(null)
          }}
          onSubmit={submit}
          onPaste={(text) => {
            if (!text) return
            const next =
              value.text.slice(0, value.cursorPosition) +
              text +
              value.text.slice(value.cursorPosition)
            setValue({
              text: next,
              cursorPosition: value.cursorPosition + text.length,
              lastEditDueToNav: false,
            })
          }}
          onKeyIntercept={handleKeyIntercept}
          placeholder="Ej. Refactor de autenticación"
          focused={true}
          maxHeight={1}
          minHeight={1}
        />
      </box>
      {error && <text style={{ fg: theme.error }}>Error: {error}</text>}
      <text style={{ fg: theme.muted }}>
        Enter: guardar · Esc: cancelar
      </text>
    </box>
  )
}
