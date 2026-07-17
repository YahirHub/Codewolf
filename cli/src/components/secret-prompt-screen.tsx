import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { SecretPromptRequest } from '@codebuff/common/types/secret-prompt'

interface SecretPromptScreenProps {
  request: SecretPromptRequest
  onSubmit: (value: string) => void
  onCancel: () => void
}

type SecretInput = {
  text: string
  cursorPosition: number
  lastEditDueToNav: boolean
}

const emptyInput = (): SecretInput => ({
  text: '',
  cursorPosition: 0,
  lastEditDueToNav: false,
})

export const SecretPromptScreen: React.FC<SecretPromptScreenProps> = ({
  request,
  onSubmit,
  onCancel,
}) => {
  const theme = useTheme()
  const [primary, setPrimary] = useState<SecretInput>(emptyInput)
  const [confirmation, setConfirmation] = useState<SecretInput>(emptyInput)
  const primaryRef = useRef<SecretInput>(primary)
  const confirmationRef = useRef<SecretInput>(confirmation)
  const [step, setStep] = useState<'primary' | 'confirmation'>('primary')
  const [error, setError] = useState<string | null>(null)

  const updatePrimary = useCallback((value: SecretInput) => {
    primaryRef.current = value
    setPrimary(value)
  }, [])

  const updateConfirmation = useCallback((value: SecretInput) => {
    confirmationRef.current = value
    setConfirmation(value)
  }, [])

  const resetInputs = useCallback(() => {
    updatePrimary(emptyInput())
    updateConfirmation(emptyInput())
  }, [updateConfirmation, updatePrimary])

  useEffect(() => {
    resetInputs()
    setStep('primary')
    setError(null)
  }, [request.requestId, resetInputs])

  const submitCurrent = useCallback(() => {
    // MultilineInput updates onChange synchronously, while React may defer the
    // corresponding render. Read the refs so pressing Enter immediately after
    // typing or pasting never compares stale password values.
    const primaryValue = primaryRef.current.text
    const confirmationValue = confirmationRef.current.text
    const minLength = request.minLength ?? 1

    if (primaryValue.length < minLength) {
      setError(
        minLength > 1
          ? `La contraseña debe tener al menos ${minLength} caracteres.`
          : 'La contraseña no puede estar vacía.',
      )
      return
    }

    if (request.confirm && step === 'primary') {
      setStep('confirmation')
      setError(null)
      return
    }

    if (request.confirm && confirmationValue !== primaryValue) {
      updateConfirmation(emptyInput())
      setError('Las contraseñas no coinciden. Vuelve a confirmarla.')
      return
    }

    resetInputs()
    onSubmit(primaryValue)
  }, [
    onSubmit,
    request.confirm,
    request.minLength,
    resetInputs,
    step,
    updateConfirmation,
  ])

  const active = step === 'primary' ? primary : confirmation
  const setActive = step === 'primary' ? updatePrimary : updateConfirmation

  return (
    <box
      title=" Bóveda SSH · Entrada segura "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.primary,
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        {request.title}
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        {request.message}
      </text>
      {request.serverName && (
        <text style={{ fg: theme.muted }}>Servidor: {request.serverName}</text>
      )}
      {request.attempt && request.maxAttempts && (
        <text style={{ fg: theme.muted }}>
          Intento {request.attempt} de {request.maxAttempts}
        </text>
      )}

      <text style={{ fg: theme.foreground, marginTop: 1 }}>
        {request.confirm && step === 'confirmation'
          ? 'Confirma la contraseña:'
          : 'Contraseña:'}
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
          value={active.text}
          cursorPosition={active.cursorPosition}
          onChange={setActive}
          onSubmit={submitCurrent}
          onPaste={(text) => {
            const normalized = (text ?? '').replace(/[\r\n]+/g, '')
            setActive({
              text: normalized,
              cursorPosition: normalized.length,
              lastEditDueToNav: false,
            })
          }}
          onKeyIntercept={(key) => {
            if (key.name === 'escape') {
              onCancel()
              return true
            }
            return false
          }}
          placeholder={
            request.confirm && step === 'confirmation'
              ? 'Repite la contraseña'
              : 'Escribe la contraseña'
          }
          focused
          maskCharacter="•"
          maxHeight={1}
          minHeight={1}
        />
      </box>

      {error && <text style={{ fg: theme.error, marginTop: 1 }}>{error}</text>}
      <text style={{ fg: theme.muted, marginTop: 1, wrapMode: 'word' }}>
        El valor se entrega directamente al gestor local de la bóveda. No se
        añade al chat, no se muestra al agente y no se guarda sin cifrar.
      </text>

      <box style={{ flexDirection: 'row', gap: 1, marginTop: 1 }}>
        <Button
          onClick={submitCurrent}
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor: theme.success,
            customBorderChars: BORDER_CHARS,
          }}
        >
          <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>
            {request.confirm && step === 'primary' ? 'CONTINUAR' : 'CONFIRMAR'}
          </text>
        </Button>
        <Button
          onClick={onCancel}
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor: theme.error,
            customBorderChars: BORDER_CHARS,
          }}
        >
          <text style={{ fg: theme.error }}>CANCELAR</text>
        </Button>
      </box>
      <text style={{ fg: theme.muted }}>Enter: confirmar · Esc: cancelar</text>
    </box>
  )
}
