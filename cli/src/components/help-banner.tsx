import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useTheme } from '../hooks/use-theme'
import { IS_FREEBUFF } from '../utils/constants'
import { useChatStore } from '../state/chat-store'

const HELP_TIMEOUT = 60 * 1000

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme()
  return <text style={{ fg: theme.muted }}>{children}</text>
}

const Shortcut = ({ keys, action }: { keys: string; action: string }) => {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.foreground }}>{keys}</text>
      <text style={{ fg: theme.muted }}>{action}</text>
    </box>
  )
}

export const HelpBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()

  React.useEffect(() => {
    const timer = setTimeout(() => setInputMode('default'), HELP_TIMEOUT)
    return () => clearTimeout(timer)
  }, [setInputMode])

  return (
    <BottomBanner borderColorKey="info" onClose={() => setInputMode('default')}>
      <box style={{ flexDirection: 'column', gap: 1, flexGrow: 1 }}>
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
      </box>
    </BottomBanner>
  )
}
