import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { createOpenAICodexProvider } from '../providers/openai-codex-catalog'
import { refreshCustomProviderStore } from '../state/custom-provider-store'
import {
  connectChatGptDeviceCode,
  connectChatGptOAuth,
  getChatGptOAuthStatus,
  stopChatGptOAuthServer,
} from '../utils/chatgpt-oauth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { activateCustomProviderModel } from '../utils/custom-providers'
import { safeOpen } from '../utils/open-url'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { ChatGptDeviceCodeInfo } from '../utils/chatgpt-oauth'
import type { CustomProviderDefinition } from '../utils/custom-providers'
import type { KeyEvent } from '@opentui/core'

type LoginMode = 'select' | 'device' | 'browser'
type LoginMethod = 'device' | 'browser'

const LOGIN_METHODS: Array<{
  id: LoginMethod
  label: string
  help: string
}> = [
  {
    id: 'device',
    label: 'Código de dispositivo (recomendado)',
    help: 'Abre una URL, inicia sesión y escribe allí el código de un solo uso.',
  },
  {
    id: 'browser',
    label: 'Navegador con callback local',
    help: 'Abre el navegador y recibe la autorización en localhost:1455.',
  },
]

interface ChatGptCodexLoginScreenProps {
  onComplete: (provider: CustomProviderDefinition) => void
  onCancel: () => void
}

export const ChatGptCodexLoginScreen: React.FC<
  ChatGptCodexLoginScreenProps
> = ({ onComplete, onCancel }) => {
  const theme = useTheme()
  const [mode, setMode] = useState<LoginMode>('select')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deviceInfo, setDeviceInfo] = useState<ChatGptDeviceCodeInfo | null>(
    null,
  )
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const status = useMemo(() => getChatGptOAuthStatus(), [])

  const stopCurrentFlow = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    stopChatGptOAuthServer()
  }, [])

  useEffect(() => stopCurrentFlow, [stopCurrentFlow])

  const finishLogin = useCallback(() => {
    const provider = createOpenAICodexProvider()
    activateCustomProviderModel(provider.id, provider.models[0]!.id)
    refreshCustomProviderStore()
    resetCodebuffClient()
    onComplete(provider)
  }, [onComplete])

  const startDeviceLogin = useCallback(() => {
    stopCurrentFlow()
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    setMode('device')
    setDeviceInfo(null)
    setBrowserUrl(null)
    setLoading(true)
    setError(null)

    void connectChatGptDeviceCode({
      signal: abortController.signal,
      onDeviceCode: (info) => {
        setDeviceInfo(info)
        void safeOpen(info.verificationUrl)
      },
    })
      .then(() => finishLogin())
      .catch((caught) => {
        if (abortController.signal.aborted) return
        setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
          setLoading(false)
        }
      })
  }, [finishLogin, stopCurrentFlow])

  const startBrowserLogin = useCallback(() => {
    stopCurrentFlow()
    setMode('browser')
    setDeviceInfo(null)
    setLoading(true)
    setError(null)

    try {
      const flow = connectChatGptOAuth()
      setBrowserUrl(flow.authUrl)
      void flow.credentials
        .then(() => finishLogin())
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : String(caught))
        })
        .finally(() => setLoading(false))
    } catch (caught) {
      setLoading(false)
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [finishLogin, stopCurrentFlow])

  const chooseMethod = useCallback(
    (method: LoginMethod) => {
      if (method === 'device') startDeviceLogin()
      else startBrowserLogin()
    },
    [startBrowserLogin, startDeviceLogin],
  )

  const returnToMethods = useCallback(() => {
    stopCurrentFlow()
    setMode('select')
    setDeviceInfo(null)
    setBrowserUrl(null)
    setLoading(false)
    setError(null)
  }, [stopCurrentFlow])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          if (mode === 'select') onCancel()
          else returnToMethods()
          return
        }

        if (mode !== 'select') return
        if (key.name === 'up') {
          setSelectedIndex((previous) => Math.max(0, previous - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((previous) =>
            Math.min(LOGIN_METHODS.length - 1, previous + 1),
          )
          return
        }
        if (isPlainEnterKey(key)) {
          const method = LOGIN_METHODS[selectedIndex]
          if (method) chooseMethod(method.id)
        }
      },
      [chooseMethod, mode, onCancel, returnToMethods, selectedIndex],
    ),
  )

  if (mode === 'device') {
    return (
      <box
        title=" ChatGPT/Codex · código de dispositivo "
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: error ? theme.error : theme.border,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'column',
        }}
      >
        {deviceInfo ? (
          <>
            <text style={{ fg: theme.foreground, wrapMode: 'word' }}>
              1. Abre esta dirección e inicia sesión con tu cuenta de ChatGPT:
            </text>
            <text
              style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}
            >
              {deviceInfo.verificationUrl}
            </text>
            <text style={{ fg: theme.foreground }}>
              2. Introduce este código de un solo uso en la página:
            </text>
            <text
              style={{ fg: theme.success, attributes: TextAttributes.BOLD }}
            >
              {deviceInfo.userCode}
            </text>
            <Button
              onClick={() => void safeOpen(deviceInfo.verificationUrl)}
              style={{ width: '100%', height: 1, paddingLeft: 1 }}
            >
              <text style={{ fg: theme.foreground }}>Abrir URL nuevamente</text>
            </Button>
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              Codewolf comprobará la autorización automáticamente. No pegues el
              token ni la contraseña en la terminal.
            </text>
          </>
        ) : (
          <text style={{ fg: theme.muted }}>
            Solicitando un código de dispositivo a ChatGPT…
          </text>
        )}
        {loading && (
          <text style={{ fg: theme.secondary }}>
            Esperando a que completes el inicio de sesión…
          </text>
        )}
        {error && <text style={{ fg: theme.error }}>{error}</text>}
        <text style={{ fg: theme.muted }}>Esc volver y cancelar</text>
      </box>
    )
  }

  if (mode === 'browser') {
    return (
      <box
        title=" ChatGPT/Codex · navegador "
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: error ? theme.error : theme.border,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'column',
        }}
      >
        <text style={{ fg: theme.foreground, wrapMode: 'word' }}>
          Completa el acceso en el navegador. Codewolf recibirá la autorización
          mediante el callback local.
        </text>
        {browserUrl && (
          <>
            <text style={{ fg: theme.secondary, wrapMode: 'word' }}>
              {browserUrl}
            </text>
            <Button
              onClick={() => void safeOpen(browserUrl)}
              style={{ width: '100%', height: 1, paddingLeft: 1 }}
            >
              <text style={{ fg: theme.foreground }}>Abrir URL nuevamente</text>
            </Button>
          </>
        )}
        {loading && (
          <text style={{ fg: theme.secondary }}>
            Esperando la respuesta del navegador…
          </text>
        )}
        {error && <text style={{ fg: theme.error }}>{error}</text>}
        <text style={{ fg: theme.muted }}>Esc volver y cancelar</text>
      </box>
    )
  }

  return (
    <box
      title=" ChatGPT Plus/Pro (Codex Subscription) "
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
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        {status.connected
          ? 'Ya existe una sesión válida. Puedes volver a autenticarla y reemplazar las credenciales actuales.'
          : 'Conecta tu cuenta de ChatGPT para usar los modelos disponibles en tu plan y espacio de trabajo de Codex.'}
      </text>
      {LOGIN_METHODS.map((method, index) => {
        const selected = selectedIndex === index
        return (
          <Button
            key={method.id}
            onClick={() => {
              setSelectedIndex(index)
              chooseMethod(method.id)
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
                  fg: selected ? theme.foreground : theme.muted,
                  attributes: selected ? TextAttributes.BOLD : undefined,
                }}
              >
                {selected ? '→' : ' '} {method.label}
              </text>
              <text style={{ fg: theme.muted }}> {method.help}</text>
            </box>
          </Button>
        )
      })}
      {error && <text style={{ fg: theme.error }}>{error}</text>}
      <text style={{ fg: theme.muted }}>
        ↑↓ navegar · Enter seleccionar · Esc volver
      </text>
    </box>
  )
}
