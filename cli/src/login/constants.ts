import { env } from '@codebuff/common/env'

// Get the website URL from environment or use default
export const WEBSITE_URL = env.NEXT_PUBLIC_CODEBUFF_APP_URL

export const LOGIN_WEBSITE_URL = WEBSITE_URL

// Codewolf ASCII logo - compact version for terminal use
const LOGO_CODEWOLF = `
  ██████╗ ██████╗ ██████╗ ███████╗██╗    ██╗ ██████╗ ██╗     ███████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝██║    ██║██╔═══██╗██║     ██╔════╝
 ██║     ██║   ██║██║  ██║█████╗  ██║ █╗ ██║██║   ██║██║     █████╗
 ██║     ██║   ██║██║  ██║██╔══╝  ██║███╗██║██║   ██║██║     ██╔══╝
 ╚██████╗╚██████╔╝██████╔╝███████╗╚███╔███╔╝╚██████╔╝███████╗██║
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚══╝╚══╝  ╚═════╝ ╚══════╝╚═╝
`

const LOGO_SMALL_CODEWOLF = `
  ██████╗ ██╗    ██╗
 ██╔════╝ ██║    ██║
 ██║      ██║ █╗ ██║
 ██║      ██║███╗██║
 ╚██████╗ ╚███╔███╔╝
  ╚═════╝  ╚══╝╚══╝
`


export const LOGO = LOGO_CODEWOLF
export const LOGO_SMALL = LOGO_SMALL_CODEWOLF

// Shadow/border characters that receive the sheen animation effect
export const SHADOW_CHARS = new Set([
  '╚',
  '═',
  '╝',
  '║',
  '╔',
  '╗',
  '╠',
  '╣',
  '╦',
  '╩',
  '╬',
])

// Modal sizing constants
export const DEFAULT_TERMINAL_HEIGHT = 24
export const MODAL_VERTICAL_MARGIN = 2 // Space for top positioning (1) + bottom margin (1)
export const MAX_MODAL_BASE_HEIGHT = 22 // Maximum height when no warning banner
export const WARNING_BANNER_HEIGHT = 3 // Height of invalid credentials banner (padding + text + padding)

// Sheen animation constants
export const SHEEN_WIDTH = 5
export const SHEEN_STEP = 2 // Advance 2 positions per frame for efficiency
export const SHEEN_INTERVAL_MS = 150
