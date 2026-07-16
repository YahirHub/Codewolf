import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { AnimatedCodewolfLogo } from './animated-codewolf-logo'
import { Button } from './button'
import { ProviderAuthFlowScreen } from './provider-auth-flow-screen'
import { ProviderLoginScreen } from './provider-login-screen'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { OPENCODE_FREE_PROVIDER_ID } from '../providers/opencode-catalog'
import { refreshCustomProviderStore } from '../state/custom-provider-store'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { setActiveCustomProvider } from '../utils/custom-providers'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { KeyEvent } from '@opentui/core'

type OnboardingView = 'welcome' | 'subscription' | 'custom-provider'
type OnboardingChoice = 'custom-provider' | 'subscription' | 'opencode-free'

const OPTIONS: Array<{
  id: OnboardingChoice
  label: string
  help: string
  tag: string
  marker: string
}> = [
  {
    id: 'subscription',
    label: 'ChatGPT Plus / Pro',
    help: 'Inicia sesión con tu cuenta y usa Codex Subscription sin configurar una API key.',
    tag: 'SUSCRIPCIÓN',
    marker: '01',
  },
  {
    id: 'custom-provider',
    label: 'Proveedor personalizado',
    help: 'Conecta una API compatible con OpenAI y descubre o registra sus modelos.',
    tag: 'API KEY',
    marker: '02',
  },
  {
    id: 'opencode-free',
    label: 'OpenCode Free',
    help: 'Empieza ahora con el catálogo gratuito dinámico de OpenCode, sin cuenta ni clave.',
    tag: 'GRATIS',
    marker: '03',
  },
]

interface FirstRunOnboardingScreenProps {
  onComplete: () => void
}

export const FirstRunOnboardingScreen: React.FC<
  FirstRunOnboardingScreenProps
> = ({ onComplete }) => {
  const theme = useTheme()
  const { terminalHeight, terminalWidth } = useTerminalDimensions()
  const [view, setView] = useState<OnboardingView>('welcome')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const panelWidth = Math.max(10, Math.min(96, terminalWidth - 2))
  const showAsciiLogo = terminalHeight >= 31 && terminalWidth >= 52
  const showIntroHelp = terminalHeight >= 27
  const showSelectedDetails = terminalHeight >= 22
  const showAttribution = terminalHeight >= 20
  const optionGap = terminalHeight >= 28 ? 1 : 0
  const panelHeight = Math.max(
    12,
    Math.min(showAsciiLogo ? 35 : 25, terminalHeight - 2),
  )
  const selectedOption = OPTIONS[selectedIndex] ?? OPTIONS[0]!

  const finishWithOpenCodeFree = useCallback(() => {
    try {
      setActiveCustomProvider(OPENCODE_FREE_PROVIDER_ID)
      refreshCustomProviderStore()
      resetCodebuffClient()
      onComplete()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [onComplete])

  const choose = useCallback(
    (choice: OnboardingChoice) => {
      setError(null)
      if (choice === 'opencode-free') {
        finishWithOpenCodeFree()
        return
      }
      setView(choice)
    },
    [finishWithOpenCodeFree],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (view !== 'welcome') return
        if (key.name === 'up') {
          setSelectedIndex((current) => Math.max(0, current - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((current) =>
            Math.min(OPTIONS.length - 1, current + 1),
          )
          return
        }
        if (!isPlainEnterKey(key)) return
        const choice = OPTIONS[selectedIndex]
        if (choice) choose(choice.id)
      },
      [choose, selectedIndex, view],
    ),
  )

  const optionRows = useMemo(
    () =>
      OPTIONS.map((option, index) => {
        const selected = selectedIndex === index
        return (
          <Button
            key={option.id}
            onClick={() => {
              setSelectedIndex(index)
              choose(option.id)
            }}
            onMouseOver={() => setSelectedIndex(index)}
            style={{
              width: '100%',
              height: 3,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 1,
              paddingRight: 1,
              borderStyle: 'single',
              borderColor: selected ? theme.primary : theme.border,
              backgroundColor: selected ? theme.surfaceHover : theme.surface,
              marginBottom: index === OPTIONS.length - 1 ? 0 : optionGap,
            }}
          >
            <box
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexGrow: 1,
                flexShrink: 1,
                overflow: 'hidden',
              }}
            >
              <text
                style={{
                  fg: selected ? theme.primary : theme.muted,
                  attributes: TextAttributes.BOLD,
                  marginRight: 1,
                }}
              >
                {selected ? '●' : option.marker}
              </text>
              <text
                style={{
                  fg: selected ? theme.foreground : theme.muted,
                  attributes: selected ? TextAttributes.BOLD : undefined,
                  wrapMode: 'none',
                }}
              >
                {option.label}
              </text>
            </box>
            <text
              style={{
                fg: selected ? theme.primary : theme.muted,
                attributes: TextAttributes.BOLD,
                flexShrink: 0,
              }}
            >
              {option.tag}
            </text>
          </Button>
        )
      }),
    [choose, optionGap, selectedIndex, theme],
  )

  if (view === 'subscription') {
    return (
      <ProviderAuthFlowScreen
        initialView="subscription-provider"
        onComplete={onComplete}
        onCancel={() => {
          setView('welcome')
          setSelectedIndex(0)
        }}
      />
    )
  }

  if (view === 'custom-provider') {
    return (
      <ProviderLoginScreen
        onComplete={onComplete}
        onCancel={() => {
          setView('welcome')
          setSelectedIndex(1)
        }}
      />
    )
  }

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.background,
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      <box
        title=" CONFIGURACIÓN INICIAL "
        titleAlignment="center"
        style={{
          width: panelWidth,
          height: panelHeight,
          maxHeight: panelHeight,
          borderStyle: 'single',
          borderColor: theme.primary,
          backgroundColor: theme.background,
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: showAsciiLogo ? 1 : 0,
          paddingBottom: showAsciiLogo ? 1 : 0,
          flexDirection: 'column',
        }}
      >
        <AnimatedCodewolfLogo
          availableWidth={Math.max(10, Math.min(80, panelWidth - 6))}
          maxHeight={showAsciiLogo ? 6 : 1}
          align="center"
        />

        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: showAsciiLogo ? 1 : 0,
            marginBottom: 1,
          }}
        >
          <text
            style={{
              fg: theme.foreground,
              attributes: TextAttributes.BOLD,
              wrapMode: 'word',
            }}
          >
            Tu agente de desarrollo, listo para trabajar contigo.
          </text>
          {showIntroHelp && (
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              {
                'Elige cómo conectar tus modelos. Después podrás cambiarlo con /login o /models.'
              }
            </text>
          )}
        </box>

        <box
          style={{
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 1,
          }}
        >
          <text
            style={{
              fg: theme.primary,
              attributes: TextAttributes.BOLD,
            }}
          >
            ELIGE UNA OPCIÓN
          </text>
          <text style={{ fg: theme.muted }}>PASO 1 DE 1</text>
        </box>

        <box style={{ width: '100%', flexDirection: 'column' }}>
          {optionRows}
        </box>

        {showSelectedDetails && (
          <box
            style={{
              width: '100%',
              minHeight: 3,
              borderStyle: 'single',
              borderColor: theme.border,
              backgroundColor: theme.surface,
              paddingLeft: 1,
              paddingRight: 1,
              marginTop: 1,
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <text
              style={{
                fg: theme.primary,
                attributes: TextAttributes.BOLD,
                wrapMode: 'word',
              }}
            >
              {selectedOption.label}
            </text>
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              {selectedOption.help}
            </text>
          </box>
        )}

        {error && (
          <text style={{ fg: theme.error, wrapMode: 'word', marginTop: 1 }}>
            Error: {error}
          </text>
        )}

        <box style={{ flexGrow: 1 }} />

        <box
          style={{
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {showAttribution && (
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              {
                'Creado por github.com/YahirHub · Basado en github.com/CodebuffAI/codebuff'
              }
            </text>
          )}
          <text style={{ fg: theme.muted, marginTop: 1 }}>
            ↑↓ navegar · Enter continuar
          </text>
        </box>
      </box>
    </box>
  )
}
