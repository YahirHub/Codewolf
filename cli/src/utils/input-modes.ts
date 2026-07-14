import { IS_FREEBUFF } from './constants'

// Input mode types and configurations
// To add a new mode:
// 1. Add it to the InputMode type
// 2. Add its configuration to INPUT_MODE_CONFIGS

export type InputMode =
  | 'default'
  | 'bash'
  | 'homeDir'
  | 'plan'
  | 'review'
  | 'interview'
  | 'usage'
  | 'image'
  | 'help'
  | 'connect:chatgpt'
  | 'outOfCredits'
  | 'subscriptionLimit'

// Theme color keys that are valid color values (must match ChatTheme keys)
export type ThemeColorKey =
  | 'foreground'
  | 'background'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'muted'
  | 'imageCardBorder'
  | 'link'

export type InputModeConfig = {
  /** Prefix icon shown before input (e.g., "!" for bash) */
  icon: string | null
  /** Colored label shown before input (e.g., "Plan") */
  label: string | null
  /** Theme color key for icon and border */
  color: ThemeColorKey
  /** Input placeholder text */
  placeholder: string
  /** Width adjustment for the prefix (icon width + padding) */
  widthAdjustment: number
  /** Whether to show the agent mode toggle */
  showAgentModeToggle: boolean
  /** Whether to disable slash command suggestions */
  disableSlashSuggestions: boolean
  /** Whether keyboard shortcuts (Escape, Backspace) can exit this mode */
  blockKeyboardExit: boolean
}

export const INPUT_MODE_CONFIGS: Record<InputMode, InputModeConfig> = {
  default: {
    icon: null,
    label: null,
    color: 'foreground',
    placeholder: 'escribe una tarea de programación o / para ver comandos',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  bash: {
    icon: null,
    label: '!',
    color: 'info',
    placeholder: 'escribe un comando Bash...',
    widthAdjustment: 4, // ` ! ` (3 chars) + 1 padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  homeDir: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: 'escribe una tarea de programación o / para ver comandos',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  interview: {
    icon: null,
    label: 'Entrevista',
    color: 'info',
    placeholder:
      'describe una función, error u otra solicitud que quieras detallar...',
    widthAdjustment: 12,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  plan: {
    icon: null,
    label: 'Plan',
    color: 'info',
    placeholder: 'describe lo que quieres planear...',
    widthAdjustment: 7,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  review: {
    icon: null,
    label: 'Revisión',
    color: 'info',
    placeholder: 'describe qué quieres revisar...',
    widthAdjustment: 9,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  usage: {
    icon: null,
    label: null,
    color: 'foreground',
    placeholder: 'escribe una tarea de programación o / para ver comandos',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  image: {
    icon: '📎',
    label: null,
    color: 'imageCardBorder',
    placeholder: 'escribe la ruta de la imagen o usa Ctrl+V para pegarla',
    widthAdjustment: 3, // emoji width + padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  help: {
    icon: null,
    label: null,
    color: 'info',
    placeholder: 'escribe una tarea de programación o / para ver comandos',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  'connect:chatgpt': {
    icon: '🔐',
    label: null,
    color: 'info',
    placeholder: 'autorizando en el navegador... pulsa Esc para cancelar',
    widthAdjustment: 3,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  outOfCredits: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: '',
    widthAdjustment: 0,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  subscriptionLimit: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: '',
    widthAdjustment: 0,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: true, // El usuario debe pulsar "Continuar con créditos" o esperar el restablecimiento
  },
}

// In Freebuff, never show the agent mode toggle
if (IS_FREEBUFF) {
  for (const key of Object.keys(INPUT_MODE_CONFIGS) as InputMode[]) {
    INPUT_MODE_CONFIGS[key].showAgentModeToggle = false
  }
}

export function getInputModeConfig(mode: InputMode): InputModeConfig {
  return INPUT_MODE_CONFIGS[mode]
}
