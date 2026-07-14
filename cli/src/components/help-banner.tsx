import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import { IS_FREEBUFF } from '../utils/constants'
import { useChatStore } from '../state/chat-store'

const HELP_TIMEOUT = 60 * 1000 // 60 seconds

/** Section header component for consistent styling */
const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme()
  return <text style={{ fg: theme.muted }}>{children}</text>
}

/** Keyboard shortcut item */
const Shortcut = ({ keys, action }: { keys: string; action: string }) => {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.foreground }}>{keys}</text>
      <text style={{ fg: theme.muted }}>{action}</text>
    </box>
  )
}

/** Help banner showing keyboard shortcuts and tips in an organized layout. */
export const HelpBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()
  const { data: subscriptionData } = useSubscriptionQuery()
  const hasSubscription = subscriptionData?.hasSubscription ?? false

  // Auto-hide after timeout
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setInputMode('default')
    }, HELP_TIMEOUT)
    return () => clearTimeout(timer)
  }, [setInputMode])

  return (
    <BottomBanner borderColorKey="info" onClose={() => setInputMode('default')}>
      <box style={{ flexDirection: 'column', gap: 1, flexGrow: 1 }}>
        {/* Shortcuts Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Atajos</SectionHeader>
          <box
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 2,
              paddingLeft: 2,
            }}
          >
            <Shortcut keys="Ctrl+C / Esc" action="detener" />
            <Shortcut keys="Ctrl+J / Opt+Enter" action="nueva línea" />
            <Shortcut keys="↑↓" action="historial" />
            <Shortcut keys="Ctrl+T" action="contraer/expandir agentes" />
          </box>
        </box>

        {/* Features Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Funciones</SectionHeader>
          <box
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 2,
              paddingLeft: 2,
            }}
          >
            <Shortcut keys="/" action="comandos" />
            <Shortcut keys="@files" action="mencionar" />
            <Shortcut keys="@agents" action="usar agente" />
            <Shortcut keys="!bash" action="ejecutar comando" />
          </box>
        </box>

        {/* Tips Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Consejos</SectionHeader>
          <box style={{ flexDirection: 'column', paddingLeft: 2 }}>
            {IS_FREEBUFF && (
              <text style={{ fg: theme.muted }}>
                Flujo sugerido: /interview → /plan → implementar → /review
              </text>
            )}
            <text style={{ fg: theme.muted }}>
              Usa @ para indicar agentes que se iniciarán o archivos que se
              leerán
            </text>
            <text style={{ fg: theme.muted }}>
              Arrastra para seleccionar texto: se copiará automáticamente (o
              pulsa ⎘ en un mensaje)
            </text>
            <text style={{ fg: theme.muted }}>
              Esc cancela la respuesta actual
            </text>
          </box>
        </box>

        {/* Credits Section — hidden in Freebuff */}
        {!IS_FREEBUFF && (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            <SectionHeader>Créditos</SectionHeader>
            <box style={{ flexDirection: 'column', paddingLeft: 2 }}>
              <box
                style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 1 }}
              >
                <text style={{ fg: theme.foreground }}>
                  1 crédito = 1 centavo
                </text>
                <text style={{ fg: theme.muted }}>·</text>
                <text style={{ fg: theme.foreground }}>/subscribe</text>
                <text style={{ fg: theme.muted }}>·</text>
                <text style={{ fg: theme.foreground }}>/usage</text>
                {!hasSubscription && (
                  <>
                    <text style={{ fg: theme.muted }}>·</text>
                    <text style={{ fg: theme.foreground }}>/ads:enable</text>
                  </>
                )}
              </box>
              <text style={{ fg: theme.muted }}>
                Suscríbete para obtener las mejores tarifas de créditos —
                /subscribe
              </text>
            </box>
          </box>
        )}
      </box>
    </BottomBanner>
  )
}
