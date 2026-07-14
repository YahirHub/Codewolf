import { TextAttributes } from '@opentui/core'
import React, { useCallback, useMemo, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { refreshCustomProviderStore } from '../state/custom-provider-store'
import { resetCodebuffClient } from '../utils/codebuff-client'
import {
  createCustomProviderId,
  discoverCustomProviderModels,
  normalizeCustomProviderBaseUrl,
  parseCustomProviderModels,
  upsertCustomProvider,
} from '../utils/custom-providers'

import type { InputValue } from '../types/store'
import type { CustomProviderDefinition } from '../utils/custom-providers'
import type { KeyEvent } from '@opentui/core'

type ProviderLoginStep = 'name' | 'baseUrl' | 'apiKey' | 'models'

const STEPS: ProviderLoginStep[] = ['name', 'baseUrl', 'apiKey', 'models']

const STEP_COPY: Record<
  ProviderLoginStep,
  { label: string; placeholder: string; help: string }
> = {
  name: {
    label: 'Nombre del proveedor',
    placeholder: 'Ej. Mi proveedor',
    help: 'Se usa para agrupar sus modelos en /models.',
  },
  baseUrl: {
    label: 'URL base de la API',
    placeholder: 'https://api.ejemplo.com/v1',
    help: 'Puede terminar en /v1 o /chat/completions.',
  },
  apiKey: {
    label: 'API key',
    placeholder: 'Deja vacío si la API no requiere autenticación',
    help: 'La clave se guarda separada de la configuración y se muestra oculta.',
  },
  models: {
    label: 'Modelos',
    placeholder: 'modelo-a, modelo-b',
    help: 'Escribe modelos separados por comas; deja vacío y pulsa Enter para consultar /models.',
  },
}

interface ProviderLoginScreenProps {
  onComplete: (provider: CustomProviderDefinition) => void
  onCancel: () => void
}

export const ProviderLoginScreen: React.FC<ProviderLoginScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const theme = useTheme()
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState<Record<ProviderLoginStep, string>>({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: '',
  })
  const [cursorPosition, setCursorPosition] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const step = STEPS[stepIndex]!
  const currentValue = values[step]
  const copy = STEP_COPY[step]

  const completedRows = useMemo(
    () =>
      STEPS.slice(0, stepIndex).map((completedStep) => ({
        step: completedStep,
        label: STEP_COPY[completedStep].label,
        value:
          completedStep === 'apiKey'
            ? values.apiKey
              ? '••••••••'
              : 'Sin autenticación'
            : values[completedStep],
      })),
    [stepIndex, values],
  )

  const setCurrentValue = useCallback(
    (input: InputValue) => {
      setValues((previous) => ({ ...previous, [step]: input.text }))
      setCursorPosition(input.cursorPosition)
      setError(null)
    },
    [step],
  )

  const goBack = useCallback(() => {
    const previousStep = STEPS[stepIndex - 1]
    if (!previousStep) return
    setStepIndex((current) => current - 1)
    setCursorPosition(values[previousStep].length)
    setError(null)
  }, [stepIndex, values])

  const advance = useCallback(() => {
    const nextStep = STEPS[stepIndex + 1]
    if (!nextStep) return
    setStepIndex((current) => current + 1)
    setCursorPosition(values[nextStep].length)
    setError(null)
  }, [stepIndex, values])

  const saveProvider = useCallback(
    async (modelsInput: string) => {
      setLoading(true)
      setError(null)
      try {
        const name = values.name.trim()
        const baseUrl = values.baseUrl.trim()
        const apiKey = values.apiKey.trim()
        const models = modelsInput.trim()
          ? parseCustomProviderModels(modelsInput)
          : await discoverCustomProviderModels({ baseUrl, apiKey })

        const provider = upsertCustomProvider({
          id: createCustomProviderId(name),
          name,
          baseUrl,
          apiKeyInput: apiKey,
          models,
        })
        refreshCustomProviderStore()
        resetCodebuffClient()
        onComplete(provider)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setLoading(false)
      }
    },
    [onComplete, values.apiKey, values.baseUrl, values.name],
  )

  const handleSubmit = useCallback(() => {
    if (loading) return
    const trimmed = currentValue.trim()

    try {
      if (step === 'name') {
        if (!trimmed) throw new Error('Escribe el nombre del proveedor.')
        createCustomProviderId(trimmed)
        advance()
        return
      }

      if (step === 'baseUrl') {
        if (!trimmed) throw new Error('Escribe la URL base de la API.')
        normalizeCustomProviderBaseUrl(trimmed)
        advance()
        return
      }

      if (step === 'apiKey') {
        advance()
        return
      }

      void saveProvider(currentValue)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [advance, currentValue, loading, saveProvider, step])

  const handlePaste = useCallback(
    (text?: string) => {
      if (!text) return
      const next =
        currentValue.slice(0, cursorPosition) +
        text +
        currentValue.slice(cursorPosition)
      setValues((previous) => ({ ...previous, [step]: next }))
      setCursorPosition(cursorPosition + text.length)
    },
    [currentValue, cursorPosition, step],
  )

  const handleKeyIntercept = useCallback(
    (key: KeyEvent) => {
      if (key.name === 'escape') {
        onCancel()
        return true
      }
      if (
        key.name === 'backspace' &&
        currentValue.length === 0 &&
        cursorPosition === 0 &&
        stepIndex > 0
      ) {
        goBack()
        return true
      }
      return false
    },
    [currentValue.length, cursorPosition, goBack, onCancel, stepIndex],
  )

  return (
    <box
      title=" Configurar proveedor "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        Paso {stepIndex + 1} de {STEPS.length}: {copy.label}
      </text>

      {completedRows.map((row) => (
        <text key={row.step} style={{ fg: theme.muted, wrapMode: 'word' }}>
          ✓ {row.label}: {row.value}
        </text>
      ))}

      <box
        style={{
          borderStyle: 'single',
          borderColor: error ? theme.error : theme.primary,
          paddingLeft: 1,
          paddingRight: 1,
          marginTop: completedRows.length > 0 ? 1 : 0,
        }}
      >
        <MultilineInput
          value={currentValue}
          cursorPosition={cursorPosition}
          onChange={setCurrentValue}
          onSubmit={handleSubmit}
          onPaste={handlePaste}
          onKeyIntercept={handleKeyIntercept}
          placeholder={copy.placeholder}
          focused={!loading}
          maxHeight={step === 'models' ? 3 : 1}
          minHeight={1}
          maskCharacter={step === 'apiKey' ? '•' : undefined}
        />
      </box>

      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        {loading ? 'Consultando /models y guardando proveedor...' : copy.help}
      </text>
      {error && (
        <text style={{ fg: theme.error, wrapMode: 'word' }}>
          Error: {error}
        </text>
      )}
      <text style={{ fg: theme.muted }}>
        Enter: continuar · Retroceso: volver · Esc: cancelar
      </text>
    </box>
  )
}
