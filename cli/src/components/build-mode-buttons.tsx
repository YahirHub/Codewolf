import { useState } from 'react'

import { Button } from './button'
import { IS_FREEBUFF } from '../utils/constants'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ChatTheme } from '../types/theme-system'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
  onBuildLite,
}: {
  theme: ChatTheme
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildLite: () => void
}) => {
  if (IS_FREEBUFF) return null

  const [hoveredButton, setHoveredButton] = useState<
    'fast' | 'max' | 'lite' | 'revise' | null
  >(null)
  const { width } = useTerminalLayout()
  const isNarrow = width.is('xs')

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
      }}
    >
      {isNarrow ? null : (
        <text style={{ wrapMode: 'none' }} selectable={false}>
          <span fg={theme.secondary}>
            Elige una opción para implementar este plan:
          </span>
        </text>
      )}
      <Button
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 2,
          paddingRight: 2,
          borderStyle: 'single',
          borderColor:
            hoveredButton === 'revise' ? theme.foreground : theme.secondary,
          customBorderChars: BORDER_CHARS,
        }}
        onClick={() =>
          globalThis.dispatchEvent(new Event('codewolf:revise-plan'))
        }
        onMouseOver={() => setHoveredButton('revise')}
        onMouseOut={() => setHoveredButton(null)}
      >
        <text wrapMode="none">
          <span fg={theme.foreground}>REVISAR O AJUSTAR PLAN</span>
        </text>
      </Button>
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
        }}
      >
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor:
              hoveredButton === 'fast' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildFast}
          onMouseOver={() => setHoveredButton('fast')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Implementar PREDETERMINADO</span>
          </text>
        </Button>
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor:
              hoveredButton === 'max' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildMax}
          onMouseOver={() => setHoveredButton('max')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Implementar MÁXIMO</span>
          </text>
        </Button>
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor:
              hoveredButton === 'lite' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildLite}
          onMouseOver={() => setHoveredButton('lite')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Implementar LIGERO</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
