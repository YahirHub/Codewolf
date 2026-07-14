import type { RouterParams } from './command-registry'

function clearInput(params: RouterParams): void {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

export function handleProviderLoginCommand(params: RouterParams): {
  openProviderLogin: true
} {
  clearInput(params)
  return { openProviderLogin: true }
}

export function handleProvidersCommand(params: RouterParams): {
  openProviderManager: true
} {
  params.saveToHistory(params.inputValue.trim())
  clearInput(params)
  return { openProviderManager: true }
}

export function handleModelsCommand(params: RouterParams): {
  openModelSelector: true
} {
  clearInput(params)
  return { openModelSelector: true }
}
