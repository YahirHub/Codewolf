import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import {
  MAX_RESEARCH_TIMEOUT_MINUTES,
  MIN_RESEARCH_TIMEOUT_MINUTES,
  getResearchTimeoutMinutes,
  isProjectContextEnabled,
  isVerifiedCommitsEnabled,
  setProjectContextEnabled,
  setResearchTimeoutMinutes,
  setVerifiedCommitsEnabled,
} from '../utils/settings'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { InputValue } from '../types/store'
import type { KeyEvent } from '@opentui/core'

interface ConfigScreenProps {
  onClose: () => void
  onProjectContextChanged?: (enabled: boolean) => void
}

type ToggleConfigItem = {
  id: 'project-context' | 'verified-commits'
  kind: 'toggle'
  title: string
  description: string
}

type NumberConfigItem = {
  id: 'research-timeout'
  kind: 'number'
  title: string
  description: string
}

type ConfigItem = ToggleConfigItem | NumberConfigItem

const CONFIG_ITEMS: ConfigItem[] = [
  {
    id: 'project-context',
    kind: 'toggle',
    title: 'Contexto persistente del proyecto',
    description:
      'Resume contexto/, inyecta sus reglas en cada turno y mantiene registros técnicos después de cambios importantes.',
  },
  {
    id: 'verified-commits',
    kind: 'toggle',
    title: 'Commits automáticos verificados',
    description:
      'Después de editar, pide probar los cambios y solo crea el commit cuando confirmas que funcionan.',
  },
  {
    id: 'research-timeout',
    kind: 'number',
    title: 'Tiempo máximo de investigación',
    description:
      'Límite de seguridad para agentes de búsqueda y documentación. El agente termina antes cuando ya reunió evidencia suficiente.',
  },
]

function clampResearchMinutes(value: number): number {
  return Math.max(
    MIN_RESEARCH_TIMEOUT_MINUTES,
    Math.min(MAX_RESEARCH_TIMEOUT_MINUTES, Math.round(value)),
  )
}

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
  const [researchTimeoutMinutes, setResearchTimeoutState] = useState(() =>
    getResearchTimeoutMinutes(),
  )
  const [editingTimeout, setEditingTimeout] = useState(false)
  const [timeoutInput, setTimeoutInput] = useState<InputValue>(() => {
    const text = String(getResearchTimeoutMinutes())
    return { text, cursorPosition: text.length, lastEditDueToNav: false }
  })
  const [timeoutError, setTimeoutError] = useState<string | null>(null)

  const saveResearchTimeout = useCallback(
    (minutes: number) => {
      const normalized = clampResearchMinutes(minutes)
      setResearchTimeoutMinutes(normalized)
      setResearchTimeoutState(normalized)
      const text = String(normalized)
      setTimeoutInput({
        text,
        cursorPosition: text.length,
        lastEditDueToNav: false,
      })
      setTimeoutError(null)
    },
    [],
  )

  const submitTimeout = useCallback(() => {
    const value = Number.parseInt(timeoutInput.text.trim(), 10)
    if (!Number.isFinite(value)) {
      setTimeoutError('Escribe una cantidad válida de minutos.')
      return
    }
    saveResearchTimeout(value)
    setEditingTimeout(false)
  }, [saveResearchTimeout, timeoutInput.text])

  const toggle = useCallback(
    (item: ToggleConfigItem) => {
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

  const activateItem = useCallback(
    (item: ConfigItem) => {
      if (item.kind === 'toggle') {
        toggle(item)
        return
      }
      setTimeoutError(null)
      const text = String(researchTimeoutMinutes)
      setTimeoutInput({
        text,
        cursorPosition: text.length,
        lastEditDueToNav: false,
      })
      setEditingTimeout(true)
    },
    [researchTimeoutMinutes, toggle],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (editingTimeout) return
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

        const selected = CONFIG_ITEMS[selectedIndex]
        if (!selected) return
        if (
          selected.kind === 'number' &&
          (key.name === 'left' || key.name === 'right')
        ) {
          saveResearchTimeout(
            researchTimeoutMinutes + (key.name === 'left' ? -1 : 1),
          )
          return
        }
        if (isPlainEnterKey(key) || key.name === 'space') {
          activateItem(selected)
        }
      },
      [
        activateItem,
        editingTimeout,
        onClose,
        researchTimeoutMinutes,
        saveResearchTimeout,
        selectedIndex,
      ],
    ),
  )

  const toggleValue = (item: ToggleConfigItem): boolean =>
    item.id === 'project-context'
      ? projectContextEnabled
      : verifiedCommitsEnabled

  return (
    <box
      title=" Configuración "
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
        const status =
          item.kind === 'toggle'
            ? toggleValue(item)
              ? '● ACTIVADO'
              : '○ DESACTIVADO'
            : `${researchTimeoutMinutes} MINUTOS`

        return (
          <React.Fragment key={item.id}>
            <Button
              onClick={() => activateItem(item)}
              onMouseOver={() => setSelectedIndex(index)}
              style={{
                width: '100%',
                minHeight: 3,
                marginTop: 1,
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'column',
                backgroundColor: selected
                  ? theme.surfaceHover
                  : 'transparent',
              }}
            >
              <text
                style={{
                  fg: selected ? theme.foreground : theme.muted,
                  attributes: selected ? TextAttributes.BOLD : undefined,
                }}
              >
                {selected ? '❯' : ' '} {status} · {item.title}
              </text>
              <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                {item.description}
              </text>
            </Button>

            {item.kind === 'number' && selected && editingTimeout && (
              <box
                style={{
                  width: '100%',
                  borderStyle: 'single',
                  borderColor: timeoutError ? theme.error : theme.primary,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <MultilineInput
                  value={timeoutInput.text}
                  cursorPosition={timeoutInput.cursorPosition}
                  onChange={(next) => {
                    const digits = next.text.replace(/\D/g, '').slice(0, 3)
                    setTimeoutInput({
                      text: digits,
                      cursorPosition: Math.min(next.cursorPosition, digits.length),
                      lastEditDueToNav: false,
                    })
                    setTimeoutError(null)
                  }}
                  onSubmit={submitTimeout}
                  onPaste={(text = '') => {
                    const digits = text.replace(/\D/g, '')
                    if (!digits) return
                    const next = `${timeoutInput.text}${digits}`.slice(0, 3)
                    setTimeoutInput({
                      text: next,
                      cursorPosition: next.length,
                      lastEditDueToNav: false,
                    })
                  }}
                  onKeyIntercept={(key) => {
                    if (key.name === 'escape') {
                      setEditingTimeout(false)
                      setTimeoutError(null)
                      return true
                    }
                    return false
                  }}
                  placeholder="Minutos"
                  focused={true}
                  maxHeight={1}
                  minHeight={1}
                />
              </box>
            )}
          </React.Fragment>
        )
      })}

      {timeoutError && <text style={{ fg: theme.error }}>{timeoutError}</text>}
      <text style={{ fg: theme.muted, marginTop: 1 }}>
        {editingTimeout
          ? `Enter: guardar (${MIN_RESEARCH_TIMEOUT_MINUTES}-${MAX_RESEARCH_TIMEOUT_MINUTES} min) · Esc: cancelar`
          : '↑/↓ o Tab: navegar · ←/→: ajustar minutos · Enter: cambiar · Esc: cerrar'}
      </text>
    </box>
  )
}
