import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import {
  exportChatArchive,
  getDefaultChatExportPath,
  importChatArchive,
  previewChatArchive,
} from '../utils/chat-transfer'

import type {
  ChatArchivePreview,
  ImportedChat,
} from '../utils/chat-transfer'
import type { InputValue } from '../types/store'
import type { KeyEvent } from '@opentui/core'

interface ChatTransferScreenProps {
  mode: 'export' | 'import'
  initialPath?: string
  onClose: () => void
  onImported: (chat: ImportedChat) => void
}

export const ChatTransferScreen: React.FC<ChatTransferScreenProps> = ({
  mode,
  initialPath,
  onClose,
  onImported,
}) => {
  const theme = useTheme()
  const defaultPath = useMemo(
    () => initialPath?.trim() || (mode === 'export' ? getDefaultChatExportPath() : ''),
    [initialPath, mode],
  )
  const [value, setValue] = useState<InputValue>({
    text: defaultPath,
    cursorPosition: defaultPath.length,
    lastEditDueToNav: false,
  })
  const [preview, setPreview] = useState<ChatArchivePreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const exportCurrent = useCallback(() => {
    setBusy(true)
    setError(null)
    try {
      const state = useChatStore.getState()
      const filePath = exportChatArchive({
        outputPath: value.text,
        messages: state.messages,
        runState: state.runState,
      })
      setValue({
        text: filePath,
        cursorPosition: filePath.length,
        lastEditDueToNav: false,
      })
      setMessage(`Chat exportado a ${filePath}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [value.text])

  const inspectImport = useCallback(() => {
    setBusy(true)
    setError(null)
    try {
      setPreview(previewChatArchive(value.text))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [value.text])

  const confirmImport = useCallback(() => {
    if (!preview || busy) return
    setBusy(true)
    setError(null)
    try {
      const imported = importChatArchive(preview.filePath)
      onImported(imported)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, onImported, preview])

  const submit = useCallback(() => {
    if (busy) return
    if (message) {
      onClose()
      return
    }
    if (mode === 'export') exportCurrent()
    else if (preview) confirmImport()
    else inspectImport()
  }, [busy, confirmImport, exportCurrent, inspectImport, message, mode, onClose, preview])

  const handleKeyIntercept = useCallback(
    (key: KeyEvent) => {
      if (key.name === 'escape') {
        onClose()
        return true
      }
      return false
    },
    [onClose],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (busy || (!preview && !message)) return

        if (message) {
          if (key.name === 'escape' || isPlainEnterKey(key)) onClose()
          return
        }

        if (key.name === 'escape' || key.name === 'backspace') {
          setPreview(null)
          setError(null)
          return
        }
        if (isPlainEnterKey(key)) confirmImport()
      },
      [busy, confirmImport, message, onClose, preview],
    ),
  )

  return (
    <box
      title={mode === 'export' ? ' Exportar chat ' : ' Importar chat '}
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {!preview && !message && (
        <>
          <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
            {mode === 'export'
              ? 'Ruta del archivo de exportación'
              : 'Ruta de una exportación .jsonl de Codewolf'}
          </text>
          <box
            style={{
              borderStyle: 'single',
              borderColor: error ? theme.error : theme.primary,
              paddingLeft: 1,
              paddingRight: 1,
              marginTop: 1,
            }}
          >
            <MultilineInput
              value={value.text}
              cursorPosition={value.cursorPosition}
              onChange={(next) => {
                setValue(next)
                setError(null)
              }}
              onSubmit={submit}
              onPaste={(text) => {
                if (!text) return
                const next =
                  value.text.slice(0, value.cursorPosition) +
                  text +
                  value.text.slice(value.cursorPosition)
                setValue({
                  text: next,
                  cursorPosition: value.cursorPosition + text.length,
                  lastEditDueToNav: false,
                })
              }}
              onKeyIntercept={handleKeyIntercept}
              placeholder={
                mode === 'export'
                  ? 'codewolf-chat.jsonl'
                  : 'C:\\ruta\\chat.json'
              }
              focused={!busy}
              maxHeight={2}
              minHeight={1}
            />
          </box>
          <text style={{ fg: theme.muted, wrapMode: 'word' }}>
            {mode === 'export'
              ? 'La exportación no copia credenciales guardadas ni archivos externos, pero sí incluye todo el contenido ya presente en el chat y su estado. Trátala como información sensible.'
              : 'Primero se valida el archivo y después se solicita confirmación.'}
          </text>
        </>
      )}

      {preview && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
            Confirmar importación
          </text>
          <text style={{ fg: theme.muted }}>Nombre: {preview.name ?? 'Sin nombre'}</text>
          <text style={{ fg: theme.muted }}>Proyecto de origen: {preview.sourceProjectName}</text>
          <text style={{ fg: theme.muted }}>Mensajes: {preview.messageCount}</text>
          <text style={{ fg: theme.muted }}>Exportado: {new Date(preview.exportedAt).toLocaleString()}</text>
          {preview.sourceProjectRoot && (
            <text style={{ fg: theme.warning, wrapMode: 'word' }}>
              Origen: {preview.sourceProjectRoot}. El chat se importará en el proyecto actual y conservará su contexto anterior.
            </text>
          )}
          <text style={{ fg: theme.foreground, marginTop: 1 }}>
            Enter: importar · Retroceso/Esc: volver
          </text>
        </box>
      )}

      {message && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.success, wrapMode: 'word' }}>{message}</text>
          <text style={{ fg: theme.muted }}>Enter o Esc: cerrar</text>
        </box>
      )}

      {busy && <text style={{ fg: theme.muted }}>Procesando...</text>}
      {error && <text style={{ fg: theme.error, wrapMode: 'word' }}>Error: {error}</text>}
      {!preview && !message && (
        <text style={{ fg: theme.muted }}>Enter: continuar · Esc: cancelar</text>
      )}
    </box>
  )
}
