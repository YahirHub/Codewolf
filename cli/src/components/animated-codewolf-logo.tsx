import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { useLogo } from '../hooks/use-logo'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { getLogoAccentColor, getLogoBlockColor } from '../utils/theme-system'

interface AnimatedCodewolfLogoProps {
  /** Limit the logo to a known content width instead of the full terminal. */
  availableWidth?: number
  /** Force the one-line animated wordmark when fewer than six rows fit. */
  maxHeight?: number
  /** Disable motion while keeping the same responsive branding. */
  animationEnabled?: boolean
  /** Align the logo inside its container. */
  align?: 'left' | 'center'
}

/**
 * Reusable responsive Codewolf branding.
 *
 * Wide layouts render the ASCII logo with the existing sheen animation. Narrow
 * or short layouts fall back to an animated one-line wordmark so every screen
 * can use the same branding without hard-coding terminal breakpoints.
 */
export const AnimatedCodewolfLogo = memo(function AnimatedCodewolfLogo({
  availableWidth,
  maxHeight,
  animationEnabled = true,
  align = 'left',
}: AnimatedCodewolfLogoProps) {
  const theme = useTheme()
  const { contentMaxWidth, terminalWidth } = useTerminalDimensions()
  const resolvedWidth = Math.max(1, availableWidth ?? contentMaxWidth)
  const [sheenPosition, setSheenPosition] = useState(0)

  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const textOnly = resolvedWidth < 20 || (maxHeight != null && maxHeight < 6)
  const renderedLogoWidth = textOnly ? 8 : resolvedWidth >= 70 ? 69 : 20

  const { applySheenToChar } = useSheenAnimation({
    enabled: animationEnabled && !textOnly,
    logoColor: theme.foreground,
    accentColor,
    blockColor,
    terminalWidth: Math.min(terminalWidth, renderedLogoWidth),
    sheenPosition,
    setSheenPosition,
  })

  const { component: logoComponent } = useLogo({
    availableWidth: resolvedWidth,
    maxHeight,
    accentColor,
    blockColor,
    textColor: theme.foreground,
    applySheenToChar,
  })

  const alignment = useMemo(
    () => (align === 'center' ? 'center' : 'flex-start'),
    [align],
  )

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
        alignItems: alignment,
        flexShrink: 0,
      }}
    >
      <box
        style={{
          width: Math.min(resolvedWidth, renderedLogoWidth),
          flexDirection: 'column',
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        {textOnly ? (
          <text
            style={{
              wrapMode: 'none',
              attributes: TextAttributes.BOLD,
            }}
          >
            {animationEnabled ? (
              <ShimmerText
                text="CODEWOLF"
                interval={115}
                primaryColor={accentColor}
              />
            ) : (
              <span fg={accentColor}>CODEWOLF</span>
            )}
          </text>
        ) : (
          logoComponent
        )}
      </box>
    </box>
  )
})
