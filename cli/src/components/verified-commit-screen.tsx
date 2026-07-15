import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { getCodebuffClient } from '../utils/codebuff-client'
import { createVerifiedCommit } from '../utils/verified-commit'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type {
  PendingVerifiedCommit,
  VerifiedCommitResult,
} from '../utils/verified-commit'
import type { KeyEvent } from '@opentui/core'

interface VerifiedCommitScreenProps {
  pending: PendingVerifiedCommit
  onCommitted: (result: VerifiedCommitResult) => void
  onNeedsChanges: () => void
  onSkip: () => void
}

const OPTIONS = [
  {
    id: 'commit' as const,
    label: 'Funciona, crear commit',
    hint: 'Genera un mensaje semántico en español y confirma solo los archivos elegibles.',
  },
  {
    id: 'fix' as const,
    label: 'Necesita correcciones',
    hint: 'Vuelve al editor para explicar qué falló antes de confirmar.',
  },
  {
    id: 'skip' as const,
    label: 'No crear commit',
    hint: 'Conserva estos archivos como pendientes y los acumula en el próximo commit verificado.',
  },
]

export const VerifiedCommitScreen: React.FC<VerifiedCommitScreenProps> = ({
  pending,
  onCommitted,
  onNeedsChanges,
  onSkip,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const select = useCallback(
    async (option: (typeof OPTIONS)[number]) => {
      if (working) return
      setError(null)

      if (option.id === 'fix') {
        onNeedsChanges()
        return
      }
      if (option.id === 'skip') {
        onSkip()
        return
      }

      setWorking(true)
      try {
        const client = await getCodebuffClient().catch(() => null)
        const result = await createVerifiedCommit({
          pending,
          ...(client ? { client } : {}),
        })
        onCommitted(result)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setWorking(false)
      }
    },
    [onCommitted, onNeedsChanges, onSkip, pending, working],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (working) return
        if (key.name === 'escape') {
          onSkip()
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((current) =>
            current === 0 ? OPTIONS.length - 1 : current - 1,
          )
          return
        }
        if (key.name === 'down' || key.name === 'tab') {
          setSelectedIndex((current) => (current + 1) % OPTIONS.length)
          return
        }
        if (isPlainEnterKey(key)) {
          const selected = OPTIONS[selectedIndex]
          if (selected) void select(selected)
        }
      },
      [onSkip, select, selectedIndex, working],
    ),
  )

  return (
    <box
      title=" Verificación antes del commit "
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
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        Prueba los cambios en tu proyecto antes de confirmarlos.
      </text>
      <text style={{ fg: theme.muted }}>
        Codewolf acumuló {pending.paths.length} archivo
        {pending.paths.length === 1 ? '' : 's'} pendiente
        {pending.paths.length === 1 ? '' : 's'} de confirmación.
      </text>
      <text style={{ fg: theme.muted }}>
        Solicitud: {pending.request.trim().slice(0, 220) || '(sin texto)'}
      </text>
      {(pending.requests?.length ?? 1) > 1 && (
        <text style={{ fg: theme.warning }}>
          Este commit reúne {(pending.requests?.length ?? 1)} implementaciones
          verificadas desde el último commit creado.
        </text>
      )}
      <text style={{ fg: theme.muted }}>
        Archivos: {pending.paths.slice(0, 6).join(', ')}
        {pending.paths.length > 6 ? ` y ${pending.paths.length - 6} más` : ''}
      </text>
      {pending.skippedPreexistingPaths.length > 0 && (
        <text style={{ fg: theme.warning }}>
          Se omitirán {pending.skippedPreexistingPaths.length} archivo
          {pending.skippedPreexistingPaths.length === 1 ? '' : 's'} que ya tenía
          cambios antes del turno.
        </text>
      )}

      {OPTIONS.map((option, index) => {
        const selected = selectedIndex === index
        return (
          <Button
            key={option.id}
            onClick={() => void select(option)}
            onMouseOver={() => !working && setSelectedIndex(index)}
            style={{
              width: '100%',
              minHeight: 2,
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
              {selected ? '❯' : ' '}{' '}
              {working && option.id === 'commit'
                ? 'Preparando commit…'
                : option.label}
            </text>
            <text style={{ fg: theme.muted, paddingLeft: 2 }}>
              {option.hint}
            </text>
          </Button>
        )
      })}

      {error && <text style={{ fg: theme.error }}>Error: {error}</text>}
      <text style={{ fg: theme.muted, marginTop: 1 }}>
        ↑/↓ o Tab: navegar · Enter: seleccionar · Esc: omitir
      </text>
    </box>
  )
}
