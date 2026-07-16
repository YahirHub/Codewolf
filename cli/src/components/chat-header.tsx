import { memo } from 'react'

import { AnimatedCodewolfLogo } from './animated-codewolf-logo'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { openFileAtPath } from '../utils/open-file'
import { formatCwd } from '../utils/path-helpers'
import { TerminalLink } from './terminal-link'

export const ChatHeader = memo(function ChatHeader({
  projectRoot,
  animationEnabled,
}: {
  projectRoot: string
  animationEnabled: boolean
}) {
  const { contentMaxWidth } = useTerminalDimensions()
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          marginBottom: 1,
          marginTop: 2,
        }}
      >
        <AnimatedCodewolfLogo
          availableWidth={contentMaxWidth}
          animationEnabled={animationEnabled}
        />
      </box>
      <text style={{ wrapMode: 'word', marginBottom: 1, fg: theme.foreground }}>
        Codewolf ejecutará comandos en tu nombre para ayudarte a desarrollar.
      </text>
      <text style={{ wrapMode: 'word', marginBottom: 1, fg: theme.foreground }}>
        Directorio{' '}
        <TerminalLink
          text={formatCwd(projectRoot)}
          color={theme.muted}
          inline={true}
          underlineOnHover={true}
          onActivate={() => openFileAtPath(projectRoot)}
        />
      </text>
    </box>
  )
})
