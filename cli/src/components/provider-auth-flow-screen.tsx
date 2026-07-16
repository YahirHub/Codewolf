import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { ChatGptCodexLoginScreen } from './chatgpt-codex-login-screen'
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
import { configureNvidiaNim } from '../utils/nvidia-nim-provider'
import {
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_GO_PROVIDER_NAME,
} from '../providers/opencode-catalog'
import {
  NVIDIA_NIM_MODELS_URL,
  NVIDIA_NIM_PROVIDER_ID,
  NVIDIA_NIM_PROVIDER_NAME,
} from '../providers/nvidia-nim-catalog'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { CHATGPT_CODEX_PROVIDER_NAME } from '@codebuff/common/constants/chatgpt-oauth'

import type { InputValue } from '../types/store'
import type { CustomProviderDefinition } from '../utils/custom-providers'
import type { KeyEvent } from '@opentui/core'

type LoginView =
  | 'method'
  | 'subscription-provider'
  | 'api-provider'
  | 'chatgpt-codex'
  | 'opencode-go'
  | 'nvidia-nim'
  | 'custom'
type AuthMethod = 'subscription' | 'api-key'
type SubscriptionProvider = 'chatgpt-codex'
type ApiProvider = 'opencode-go' | 'nvidia-nim' | 'custom'

const AUTH_METHODS: Array<{
  id: AuthMethod
  label: string
  help: string
  enabled: boolean
}> = [
  {
    id: 'subscription',
    label: 'Usar una suscripción',
    help: 'Conecta ChatGPT/Codex mediante navegador o código de dispositivo.',
    enabled: true,
  },
  {
    id: 'api-key',
    label: 'Usar una API key',
    help: 'Configura NVIDIA NIM, OpenCode Go o cualquier API compatible con OpenAI.',
    enabled: true,
  },
]

const SUBSCRIPTION_PROVIDERS: Array<{
  id: SubscriptionProvider
  label: string
  help: string
}> = [
  {
    id: 'chatgpt-codex',
    label: CHATGPT_CODEX_PROVIDER_NAME,
    help: 'Usa la sesión y los límites disponibles en tu plan o workspace de Codex.',
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
    id: 'nvidia-nim',
    label: NVIDIA_NIM_PROVIDER_NAME,
    help: 'Modelos NVIDIA, DeepSeek, GLM, Nemotron, MiniMax, Mistral y otros.',
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

export const ProviderAuthFlowScreen: React.FC<ProviderAuthFlowScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const theme = useTheme()
  const [view, setView] = useState<LoginView>('method')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const rows =
    view === 'method'
      ? AUTH_METHODS
      : view === 'subscription-provider'
        ? SUBSCRIPTION_PROVIDERS
        : API_PROVIDERS

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (
          view !== 'method' &&
          view !== 'subscription-provider' &&
          view !== 'api-provider'
        )
          return
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
          setView(
            method.id === 'subscription'
              ? 'subscription-provider'
              : 'api-provider',
          )
          setSelectedIndex(0)
          setMessage(null)
          return
        }

        const provider =
          view === 'subscription-provider'
            ? SUBSCRIPTION_PROVIDERS[selectedIndex]
            : API_PROVIDERS[selectedIndex]
        if (!provider) return
        setView(provider.id)
        setSelectedIndex(0)
        setMessage(null)
      },
      [onCancel, rows.length, selectedIndex, view],
    ),
  )

  if (view === 'chatgpt-codex') {
    return (
      <ChatGptCodexLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('subscription-provider')
          setSelectedIndex(0)
        }}
      />
    )
  }

  if (view === 'custom') {
    return (
      <ProviderLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('api-provider')
          setSelectedIndex(2)
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

  if (view === 'nvidia-nim') {
    return (
      <NvidiaNimLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('api-provider')
          setSelectedIndex(1)
        }}
      />
    )
  }

  const title =
    view === 'method'
      ? ' Selecciona el método de autenticación '
      : view === 'subscription-provider'
        ? ' Selecciona la suscripción '
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
                if (!method) return
                setView(
                  method.id === 'subscription'
                    ? 'subscription-provider'
                    : 'api-provider',
                )
                setSelectedIndex(0)
                setMessage(null)
                return
              }
              const provider =
                view === 'subscription-provider'
                  ? SUBSCRIPTION_PROVIDERS[index]
                  : API_PROVIDERS[index]
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
              <text style={{ fg: theme.muted }}> {row.help}</text>
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

interface NvidiaNimLoginScreenProps {
  onComplete: (provider: CustomProviderDefinition) => void
  onCancel: () => void
}

const NvidiaNimLoginScreen: React.FC<NvidiaNimLoginScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const theme = useTheme()
  const existingProvider = useMemo(
    () =>
      loadCustomProvidersConfig().providers.find(
        (provider) => provider.id === NVIDIA_NIM_PROVIDER_ID,
      ),
    [],
  )
  const existingApiKey = useMemo(
    () =>
      existingProvider
        ? getCustomProviderApiKey(NVIDIA_NIM_PROVIDER_ID)
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
      setError('Escribe una API key de NVIDIA NIM.')
      return
    }

    setLoading(true)
    setError(null)
    void configureNvidiaNim({ apiKey })
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
      title=" NVIDIA NIM · API key "
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
        API key de NVIDIA NIM
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        La clave se guarda en provider-auth.json y se usa como Bearer solo para
        el chat. Codewolf consulta el catálogo público {NVIDIA_NIM_MODELS_URL}.
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
              : 'Pega tu API key de NVIDIA NIM'
          }
          focused={!loading}
          maxHeight={1}
          minHeight={1}
          maskCharacter="•"
        />
      </box>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        {loading
          ? 'Guardando la clave y consultando el catálogo de NVIDIA...'
          : 'El catálogo es público; NVIDIA confirmará la validez y disponibilidad de la clave al realizar la primera solicitud.'}
      </text>
      {error && <text style={{ fg: theme.error }}>Error: {error}</text>}
      <text style={{ fg: theme.muted }}>Enter: guardar · Esc: volver</text>
    </box>
  )
}
