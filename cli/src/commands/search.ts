import type { RouterParams } from './command-registry'

function clearInput(params: RouterParams): void {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

export function handleSearchSetupCommand(params: RouterParams): {
  openSearchSetup: true
} {
  clearInput(params)
  return { openSearchSetup: true }
}
