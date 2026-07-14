import type { RouterParams } from './command-registry'

export function handleTokenUsageCommand(params: RouterParams): {
  openTokenUsage: true
} {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
  return { openTokenUsage: true }
}
