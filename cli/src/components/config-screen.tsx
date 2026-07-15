import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import {
  isProjectContextEnabled,
  isVerifiedCommitsEnabled,
  setProjectContextEnabled,
  setVerifiedCommitsEnabled,
} from '../utils/settings'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { KeyEvent } from '@opentui/core'

interface ConfigScreenProps {
  onClose: () => void
  onProjectContextChanged?: (enabled: boolean) => void
}

type ConfigItem = {
  id: 'project-context' | 'verified-commits'
  title: string
  description: string
}

const CONFIG_ITEMS: ConfigItem[] = [
  {
    id: 'project-context',
    title: 'Contexto persistente del proyecto',
    description:
      'Resume contexto/, lo inyecta en el agente y mantiene archivos numerados después de cambios importantes.',
  },
  {
    id: 'verified-commits',
    title: 'Commits automáticos verificados',
    description:
      'Después de editar, pide probar los cambios y solo crea el commit cuando confirmas que funcionan.',
  },
]

export const ConfigScreen: React.FC<ConfigScreenProps> = ({
  onClose,
  onProjectContextChanged,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projectContextEnabled, setProjectContextState] = useState(() =>
    isProjectContextEnabled(),
  )
  const [verifiedCommitsEnabled, setVerifiedCommitsState] = useState(() =>
    isVerifiedCommitsEnabled(),
  )

  const values = useMemo(
    () => ({
      'project-context': projectContextEnabled,
      'verified-commits': verifiedCommitsEnabled,
    }),
    [projectContextEnabled, verifiedCommitsEnabled],
  )

  const toggle = useCallback(
    (item: ConfigItem) => {
      if (item.id === 'project-context') {
        const next = !projectContextEnabled
        setProjectContextEnabled(next)
        setProjectContextState(next)
        onProjectContextChanged?.(next)
        return
      }

      const next = !verifiedCommitsEnabled
      setVerifiedCommitsEnabled(next)
      setVerifiedCommitsState(next)
    },
    [onProjectContextChanged, projectContextEnabled, verifiedCommitsEnabled],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onClose()
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((current) =>
            current === 0 ? CONFIG_ITEMS.length - 1 : current - 1,
          )
          return
        }
        if (key.name === 'down' || key.name === 'tab') {
          setSelectedIndex((current) => (current + 1) % CONFIG_ITEMS.length)
          return
        }
        if (isPlainEnterKey(key) || key.name === 'space') {
          const selected = CONFIG_ITEMS[selectedIndex]
          if (selected) toggle(selected)
        }
      },
      [onClose, selectedIndex, toggle],
    ),
  )

  return (
    <box
      title=" Configuración de metodología "
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
      <text style={{ fg: theme.muted }}>
        Estas opciones se guardan en ~/.codewolf/settings.json y se aplican a
        todos los proyectos.
      </text>

      {CONFIG_ITEMS.map((item, index) => {
        const selected = index === selectedIndex
        const enabled = values[item.id]
        return (
          <Button
            key={item.id}
            onClick={() => toggle(item)}
            onMouseOver={() => setSelectedIndex(index)}
            style={{
              width: '100%',
              minHeight: 3,
              marginTop: 1,
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: 'column',
              backgroundColor: selected ? theme.surfaceHover : 'transparent',
            }}
          >
            <text
              style={{
                fg: selected ? theme.foreground : theme.muted,
                attributes: selected ? TextAttributes.BOLD : undefined,
              }}
            >
              {selected ? '❯' : ' '} {enabled ? '● ACTIVADO' : '○ DESACTIVADO'}{' '}
              · {item.title}
            </text>
            <text style={{ fg: theme.muted, paddingLeft: 2 }}>
              {item.description}
            </text>
          </Button>
        )
      })}

      <text style={{ fg: theme.muted, marginTop: 1 }}>
        ↑/↓ o Tab: navegar · Enter/Espacio: cambiar · Esc: cerrar
      </text>
    </box>
  )
}
