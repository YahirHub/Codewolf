import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { ProviderLoginScreen } from './provider-login-screen'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  refreshCustomProviderStore,
  useCustomProviderStore,
} from '../state/custom-provider-store'
import { resetCodebuffClient } from '../utils/codebuff-client'
import {
  getCustomProviderAuthStatus,
  removeCustomProvider,
  setActiveCustomProvider,
} from '../utils/custom-providers'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { isOpenCodeFreeProviderId } from '../providers/opencode-catalog'

import type { CustomProviderDefinition } from '../utils/custom-providers'
import type { KeyEvent } from '@opentui/core'

type ProviderManagerView = 'list' | 'actions' | 'editor' | 'delete'
type ProviderAction = 'edit' | 'activate' | 'models' | 'delete' | 'back'
type MainRow =
  | { type: 'provider'; provider: CustomProviderDefinition }
  | { type: 'add' }
  | { type: 'close' }

interface ProviderManagerScreenProps {
  onClose: () => void
  onOpenModels: () => void
}

const PROVIDER_ACTIONS: ProviderAction[] = [
  'edit',
  'activate',
  'models',
  'delete',
  'back',
]

function actionLabel(action: ProviderAction, active: boolean): string {
  switch (action) {
    case 'edit':
      return 'Editar nombre, endpoint, credencial y modelos'
    case 'activate':
      return active ? 'Proveedor activo' : 'Usar este proveedor'
    case 'models':
      return 'Abrir selector de modelos'
    case 'delete':
      return 'Eliminar proveedor'
    case 'back':
      return 'Volver'
  }
}

export const ProviderManagerScreen: React.FC<
  ProviderManagerScreenProps
> = ({ onClose, onOpenModels }) => {
  const theme = useTheme()
  const { terminalHeight } = useTerminalDimensions()
  const config = useCustomProviderStore((state) => state.config)
  const [view, setView] = useState<ProviderManagerView>('list')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)

  const providers = useMemo(
    () =>
      config.providers
        .filter((provider) => !isOpenCodeFreeProviderId(provider.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [config.providers],
  )
  const rows = useMemo<MainRow[]>(
    () => [
      ...providers.map((provider): MainRow => ({ type: 'provider', provider })),
      { type: 'add' },
      { type: 'close' },
    ],
    [providers],
  )
  const selectedProvider = useMemo(
    () =>
      providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  )
  const selectedIsActive =
    selectedProvider?.id === config.activeProviderId

  const goList = useCallback((status?: string) => {
    refreshCustomProviderStore()
    setView('list')
    setSelectedIndex(0)
    setSelectedProviderId(null)
    setMessage(status ?? null)
  }, [])

  const openProvider = useCallback((provider: CustomProviderDefinition) => {
    setSelectedProviderId(provider.id)
    setSelectedIndex(0)
    setMessage(null)
    setView('actions')
  }, [])

  const activateProvider = useCallback(() => {
    if (!selectedProvider) return
    setActiveCustomProvider(selectedProvider.id)
    refreshCustomProviderStore()
    resetCodebuffClient()
    goList(`${selectedProvider.name} quedó como proveedor activo.`)
  }, [goList, selectedProvider])

  const deleteProvider = useCallback(() => {
    if (!selectedProvider) return
    const deleted = removeCustomProvider(selectedProvider.id)
    refreshCustomProviderStore()
    resetCodebuffClient()
    goList(
      deleted
        ? `${selectedProvider.name} fue eliminado.`
        : `No se pudo eliminar ${selectedProvider.name}.`,
    )
  }, [goList, selectedProvider])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (view === 'editor') return

        if (key.name === 'escape') {
          if (view === 'list') onClose()
          else goList()
          return
        }

        if (view === 'list') {
          if (key.name === 'up') {
            setSelectedIndex((previous) => Math.max(0, previous - 1))
            return
          }
          if (key.name === 'down') {
            setSelectedIndex((previous) =>
              Math.min(rows.length - 1, previous + 1),
            )
            return
          }
          if (!isPlainEnterKey(key)) return
          const row = rows[selectedIndex]
          if (!row) return
          if (row.type === 'provider') openProvider(row.provider)
          if (row.type === 'add') {
            setSelectedProviderId(null)
            setView('editor')
          }
          if (row.type === 'close') onClose()
          return
        }

        if (view === 'actions') {
          if (key.name === 'up') {
            setSelectedIndex((previous) => Math.max(0, previous - 1))
            return
          }
          if (key.name === 'down') {
            setSelectedIndex((previous) =>
              Math.min(PROVIDER_ACTIONS.length - 1, previous + 1),
            )
            return
          }
          if (!isPlainEnterKey(key)) return
          const action = PROVIDER_ACTIONS[selectedIndex]
          if (!action) return
          if (action === 'edit') setView('editor')
          if (action === 'activate' && !selectedIsActive) activateProvider()
          if (action === 'models') onOpenModels()
          if (action === 'delete') {
            setSelectedIndex(0)
            setView('delete')
          }
          if (action === 'back') goList()
          return
        }

        if (view === 'delete') {
          if (key.name === 'left' || key.name === 'right') {
            setSelectedIndex((previous) => (previous === 0 ? 1 : 0))
            return
          }
          if (!isPlainEnterKey(key)) return
          if (selectedIndex === 0) deleteProvider()
          else goList()
        }
      },
      [
        activateProvider,
        deleteProvider,
        goList,
        onClose,
        onOpenModels,
        openProvider,
        rows,
        selectedIndex,
        selectedIsActive,
        view,
      ],
    ),
  )

  if (view === 'editor') {
    return (
      <ProviderLoginScreen
        provider={selectedProvider ?? undefined}
        onComplete={(provider) =>
          goList(
            selectedProvider
              ? `${provider.name} fue actualizado.`
              : `${provider.name} fue agregado.`,
          )
        }
        onCancel={() => (selectedProvider ? setView('actions') : goList())}
      />
    )
  }

  const height = Math.max(12, Math.min(22, terminalHeight - 3))

  return (
    <box
      title=" Administrar proveedores "
      titleAlignment="center"
      style={{
        width: '100%',
        height,
        maxHeight: height,
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {view === 'list' && (
        <>
          <text
            style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
          >
            Proveedores configurados
          </text>
          <scrollbox
            scrollX={false}
            scrollbarOptions={{ visible: false }}
            verticalScrollbarOptions={{ visible: true, trackOptions: { width: 1 } }}
            style={{
              flexGrow: 1,
              rootOptions: { flexDirection: 'row', backgroundColor: 'transparent' },
              wrapperOptions: {
                border: false,
                backgroundColor: 'transparent',
                flexDirection: 'column',
              },
              contentOptions: {
                flexDirection: 'column',
                backgroundColor: 'transparent',
              },
            }}
          >
            {rows.map((row, index) => {
              const selected = index === selectedIndex
              if (row.type === 'provider') {
                const auth = getCustomProviderAuthStatus(row.provider.id)
                const active = row.provider.id === config.activeProviderId
                return (
                  <Button
                    key={row.provider.id}
                    onClick={() => openProvider(row.provider)}
                    onMouseOver={() => setSelectedIndex(index)}
                    style={{
                      width: '100%',
                      height: 2,
                      paddingLeft: 1,
                      paddingRight: 1,
                      backgroundColor: selected ? theme.surfaceHover : 'transparent',
                    }}
                  >
                    <box style={{ flexDirection: 'column' }}>
                      <text
                        style={{
                          fg: selected ? theme.foreground : theme.muted,
                          attributes: selected ? TextAttributes.BOLD : undefined,
                        }}
                      >
                        {selected ? '❯' : ' '} {active ? '●' : '○'} {row.provider.name}
                      </text>
                      <text style={{ fg: theme.muted }}>
                        {row.provider.models.length} modelo(s) · {auth.label} · {row.provider.baseUrl}
                      </text>
                    </box>
                  </Button>
                )
              }

              const label = row.type === 'add' ? '＋ Agregar proveedor' : 'Cerrar'
              return (
                <Button
                  key={row.type}
                  onClick={() => {
                    if (row.type === 'add') {
                      setSelectedProviderId(null)
                      setView('editor')
                    } else onClose()
                  }}
                  onMouseOver={() => setSelectedIndex(index)}
                  style={{
                    width: '100%',
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.surfaceHover : 'transparent',
                  }}
                >
                  <text style={{ fg: selected ? theme.foreground : theme.muted }}>
                    {selected ? '❯' : ' '} {label}
                  </text>
                </Button>
              )
            })}
          </scrollbox>
        </>
      )}

      {view === 'actions' && selectedProvider && (
        <>
          <text
            style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
          >
            {selectedProvider.name}
          </text>
          <text style={{ fg: theme.muted, wrapMode: 'word' }}>
            {selectedProvider.baseUrl} · {selectedProvider.models.length} modelo(s)
          </text>
          <box style={{ flexDirection: 'column', marginTop: 1, flexGrow: 1 }}>
            {PROVIDER_ACTIONS.map((action, index) => {
              const selected = index === selectedIndex
              const disabled = action === 'activate' && selectedIsActive
              return (
                <Button
                  key={action}
                  onClick={() => {
                    setSelectedIndex(index)
                    if (action === 'edit') setView('editor')
                    if (action === 'activate' && !selectedIsActive) activateProvider()
                    if (action === 'models') onOpenModels()
                    if (action === 'delete') {
                      setSelectedIndex(0)
                      setView('delete')
                    }
                    if (action === 'back') goList()
                  }}
                  onMouseOver={() => setSelectedIndex(index)}
                  style={{
                    width: '100%',
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.surfaceHover : 'transparent',
                  }}
                >
                  <text
                    style={{
                      fg: disabled
                        ? theme.muted
                        : selected
                          ? theme.foreground
                          : theme.muted,
                    }}
                  >
                    {selected ? '❯' : ' '} {actionLabel(action, selectedIsActive)}
                  </text>
                </Button>
              )
            })}
          </box>
        </>
      )}

      {view === 'delete' && selectedProvider && (
        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
          }}
        >
          <text
            style={{ fg: theme.error, attributes: TextAttributes.BOLD }}
          >
            ¿Eliminar {selectedProvider.name}?
          </text>
          <text style={{ fg: theme.muted, wrapMode: 'word' }}>
            Se eliminarán su configuración y la API key guardada. Los chats no se modifican.
          </text>
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            {['Eliminar', 'Cancelar'].map((label, index) => (
              <Button
                key={label}
                onClick={() => (index === 0 ? deleteProvider() : goList())}
                onMouseOver={() => setSelectedIndex(index)}
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  borderStyle: 'single',
                  borderColor: index === selectedIndex ? theme.primary : theme.muted,
                }}
              >
                <text style={{ fg: index === selectedIndex ? theme.foreground : theme.muted }}>
                  {label}
                </text>
              </Button>
            ))}
          </box>
        </box>
      )}

      {message && view === 'list' && (
        <text style={{ fg: theme.success, wrapMode: 'word' }}>{message}</text>
      )}
      {view === 'list' && (
        <text style={{ fg: theme.muted, wrapMode: 'word' }}>
          OpenCode Free se actualiza automáticamente y se selecciona desde /models.
        </text>
      )}
      <text style={{ fg: theme.muted }}>
        ↑↓ navegar · Enter seleccionar · Esc volver/cerrar
      </text>
    </box>
  )
}
