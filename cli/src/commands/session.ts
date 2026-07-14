import { getSystemMessage } from '../utils/message-history'
import { renameCurrentSession } from '../utils/session-name'
import { setTerminalTitle } from '../utils/terminal-title'

import type { RouterParams } from './command-registry'

function clearInput(params: RouterParams): void {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

export function handleRenameCommand(
  params: RouterParams,
  args: string,
): { openSessionRename: true } | void {
  const name = args.trim()
  params.saveToHistory(params.inputValue.trim())
  clearInput(params)

  if (!name) return { openSessionRename: true }

  try {
    const savedName = renameCurrentSession(name)
    setTerminalTitle(savedName)
    params.setMessages((previous) => [
      ...previous,
      getSystemMessage(`Nombre de sesión establecido: ${savedName}`),
    ])
  } catch (caught) {
    params.setMessages((previous) => [
      ...previous,
      getSystemMessage(
        `No se pudo renombrar la sesión: ${caught instanceof Error ? caught.message : String(caught)}`,
      ),
    ])
  }
}

export function handleExportCommand(
  params: RouterParams,
  args: string,
): {
  openChatTransfer: { mode: 'export'; initialPath?: string }
} {
  params.saveToHistory(params.inputValue.trim())
  clearInput(params)
  const initialPath = args.trim() || undefined
  return { openChatTransfer: { mode: 'export', initialPath } }
}

export function handleImportCommand(
  params: RouterParams,
  args: string,
): {
  openChatTransfer: { mode: 'import'; initialPath?: string }
} {
  params.saveToHistory(params.inputValue.trim())
  clearInput(params)
  const initialPath = args.trim() || undefined
  return { openChatTransfer: { mode: 'import', initialPath } }
}
