import type { AgentContentBlock } from '../types/chat'

export interface StatusInfo {
  indicator: string
  label: string
  color: string
  text: string
}

/** Get status indicator, label, color, and formatted text based on agent status */
export function getAgentStatusInfo(
  status: AgentContentBlock['status'],
  theme: { primary: string; foreground: string; muted: string },
): StatusInfo {
  switch (status) {
    case 'running':
      return {
        indicator: '●',
        label: 'ejecutando',
        color: theme.primary,
        text: '● ejecutando',
      }
    case 'failed':
      return { indicator: '✗', label: 'falló', color: 'red', text: '✗ falló' }
    case 'complete':
      return {
        indicator: '✓',
        label: 'completado',
        color: theme.foreground,
        text: 'completado ✓',
      }
    case 'cancelled':
      return {
        indicator: '⊘',
        label: 'cancelado',
        color: 'red',
        text: '⊘ cancelado',
      }
    default:
      return {
        indicator: '○',
        label: 'en espera',
        color: theme.muted,
        text: '○ en espera',
      }
  }
}
