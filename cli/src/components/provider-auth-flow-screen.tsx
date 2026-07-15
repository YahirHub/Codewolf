import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { ProviderLoginScreen } from './provider-login-screen'
import { useTheme } from '../hooks/use-theme'
import { refreshCustomProviderStore } from '../state/custom-provider-store'
import { resetCodebuffClient } from '../utils/codebuff-client'
import {
  getCustomProviderApiKey,
  loadCustomProvidersConfig,
} from '../utils/custom-providers'
import { configureOpenCodeGo } from '../utils/opencode-providers'
import {
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_GO_PROVIDER_NAME,
} from '../providers/opencode-catalog'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { InputValue } from '../types/store'
import type { CustomProviderDefinition } from '../utils/custom-providers'
import type { KeyEvent } from '@opentui/core'

type LoginView = 'method' | 'api-provider' | 'opencode-go' | 'custom'
type AuthMethod = 'subscription' | 'api-key'
type ApiProvider = 'opencode-go' | 'custom'

const AUTH_METHODS: Array<{
  id: AuthMethod
  label: string
  help: string
  enabled: boolean
}> = [
  {
    id: 'subscription',
    label: 'Usar una suscripción',
    help: 'Reservado para una integración futura de suscripciones.',
    enabled: false,
  },
  {
    id: 'api-key',
    label: 'Usar una API key',
    help: 'Configura OpenCode Go o cualquier API compatible con OpenAI.',
    enabled: true,
  },
]

const API_PROVIDERS: Array<{
  id: ApiProvider
  label: string
  help: string
}> = [
  {
    id: 'opencode-go',
    label: OPENCODE_GO_PROVIDER_NAME,
    help: 'Consulta automáticamente los modelos disponibles en OpenCode Go.',
  },
  {
    id: 'custom',
    label: 'Proveedor compatible con OpenAI',
    help: 'Configura nombre, endpoint, API key y modelos manualmente.',
  },
]

interface ProviderAuthFlowScreenProps {
  onComplete: (provider: CustomProviderDefinition) => void
  onCancel: () => void
}

export const ProviderAuthFlowScreen: React.FC<
  ProviderAuthFlowScreenProps
> = ({ onComplete, onCancel }) => {
  const theme = useTheme()
  const [view, setView] = useState<LoginView>('method')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const rows = view === 'method' ? AUTH_METHODS : API_PROVIDERS

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (view !== 'method' && view !== 'api-provider') return
        if (key.name === 'escape') {
          if (view === 'method') onCancel()
          else {
            setView('method')
            setSelectedIndex(0)
            setMessage(null)
          }
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((previous) => Math.max(0, previous - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((previous) =>
            Math.min(rows.length - 1, previous + 1),
          )
          return
        }
        if (!isPlainEnterKey(key)) return

        if (view === 'method') {
          const method = AUTH_METHODS[selectedIndex]
          if (!method) return
          if (!method.enabled) {
            setMessage(
              'Las suscripciones todavía no están disponibles en esta edición. Usa una API key.',
            )
            return
          }
          setView('api-provider')
          setSelectedIndex(0)
          setMessage(null)
          return
        }

        const provider = API_PROVIDERS[selectedIndex]
        if (!provider) return
        setView(provider.id)
        setSelectedIndex(0)
        setMessage(null)
      },
      [onCancel, rows.length, selectedIndex, view],
    ),
  )

  if (view === 'custom') {
    return (
      <ProviderLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('api-provider')
          setSelectedIndex(1)
        }}
      />
    )
  }

  if (view === 'opencode-go') {
    return (
      <OpenCodeGoLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('api-provider')
          setSelectedIndex(0)
        }}
      />
    )
  }

  const title =
    view === 'method'
      ? ' Selecciona el método de autenticación '
      : ' Selecciona el proveedor '

  return (
    <box
      title={title}
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
      {rows.map((row, index) => {
        const selected = selectedIndex === index
        const disabled = view === 'method' && !AUTH_METHODS[index]?.enabled
        return (
          <Button
            key={row.id}
            onClick={() => {
              setSelectedIndex(index)
              if (view === 'method') {
                const method = AUTH_METHODS[index]
                if (!method?.enabled) {
                  setMessage(
                    'Las suscripciones todavía no están disponibles en esta edición. Usa una API key.',
                  )
                  return
                }
                setView('api-provider')
                setSelectedIndex(0)
                setMessage(null)
                return
              }
              const provider = API_PROVIDERS[index]
              if (provider) setView(provider.id)
            }}
            onMouseOver={() => setSelectedIndex(index)}
            style={{
              width: '100%',
              height: 2,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: selected ? theme.surfaceHover : 'transparent',
            }}
          >
            <box style={{ flexDirection: 'column' }}>
              <text
                style={{
                  fg: disabled
                    ? theme.muted
                    : selected
                      ? theme.foreground
                      : theme.muted,
                  attributes: selected ? TextAttributes.BOLD : undefined,
                }}
              >
                {selected ? '→' : ' '} {row.label}
                {disabled ? ' (próximamente)' : ''}
              </text>
              <text style={{ fg: theme.muted }}>  {row.help}</text>
            </box>
          </Button>
        )
      })}

      {message && (
        <text style={{ fg: theme.warning, wrapMode: 'word' }}>{message}</text>
      )}
      <text style={{ fg: theme.muted }}>
        ↑↓ navegar · Enter seleccionar · Esc{' '}
        {view === 'method' ? 'cancelar' : 'volver'}
      </text>
    </box>
  )
}

interface OpenCodeGoLoginScreenProps {
  onComplete: (provider: CustomProviderDefinition) => void
  onCancel: () => void
}

const OpenCodeGoLoginScreen: React.FC<OpenCodeGoLoginScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const theme = useTheme()
  const existingProvider = useMemo(
    () =>
      loadCustomProvidersConfig().providers.find(
        (provider) => provider.id === OPENCODE_GO_PROVIDER_ID,
      ),
    [],
  )
  const existingApiKey = useMemo(
    () =>
      existingProvider
        ? getCustomProviderApiKey(OPENCODE_GO_PROVIDER_ID)
        : undefined,
    [existingProvider],
  )
  const [value, setValue] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = useCallback((input: InputValue) => {
    setValue(input.text)
    setCursorPosition(input.cursorPosition)
    setError(null)
  }, [])

  const handleSubmit = useCallback(() => {
    if (loading) return
    const apiKey = value.trim() || existingApiKey
    if (!apiKey) {
      setError('Escribe una API key de OpenCode Go.')
      return
    }

    setLoading(true)
    setError(null)
    void configureOpenCodeGo({ apiKey })
      .then((provider) => {
        refreshCustomProviderStore()
        resetCodebuffClient()
        onComplete(provider)
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => setLoading(false))
  }, [existingApiKey, loading, onComplete, value])

  const handlePaste = useCallback(
    (text?: string) => {
      if (!text) return
      const next =
        value.slice(0, cursorPosition) + text + value.slice(cursorPosition)
      setValue(next)
      setCursorPosition(cursorPosition + text.length)
    },
    [cursorPosition, value],
  )

  return (
    <box
      title=" OpenCode Go · API key "
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
        API key de OpenCode Go
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        La clave se guarda en provider-auth.json. Después se consultará
        automáticamente https://opencode.ai/zen/go/v1/models.
      </text>
      <box
        style={{
          borderStyle: 'single',
          borderColor: error ? theme.error : theme.primary,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <MultilineInput
          value={value}
          cursorPosition={cursorPosition}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onPaste={handlePaste}
          onKeyIntercept={(key) => {
            if (key.name === 'escape') {
              onCancel()
              return true
            }
            return false
          }}
          placeholder={
            existingApiKey
              ? 'Deja vacío para conservar la API key actual'
              : 'Pega tu API key de OpenCode Go'
          }
          focused={!loading}
          maxHeight={1}
          minHeight={1}
          maskCharacter="•"
        />
      </box>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        {loading
          ? 'Validando la clave y consultando modelos...'
          : 'OpenCode Go es independiente de OpenCode Free. Los modelos gratuitos no usan esta clave.'}
      </text>
      {error && <text style={{ fg: theme.error }}>Error: {error}</text>}
      <text style={{ fg: theme.muted }}>Enter: guardar · Esc: volver</text>
    </box>
  )
}
