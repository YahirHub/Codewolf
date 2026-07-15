import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useCustomProviderStore } from '../state/custom-provider-store'
import { refreshCustomProviderStore } from '../state/custom-provider-store'
import { resetCodebuffClient } from '../utils/codebuff-client'
import {
  activateCustomProviderModel,
  disableCustomProvider,
} from '../utils/custom-providers'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { refreshProviderCatalogs } from '../utils/provider-catalogs'

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

export interface ModelChoice {
  providerId: string | null
  providerName: string
  modelId: string
  modelName: string
  isCodebuff: boolean
}

interface ModelSection {
  providerId: string | null
  providerName: string
  choices: ModelChoice[]
}

interface ModelSelectorScreenProps {
  onSelect: (choice: ModelChoice) => void
  onCancel: () => void
}

export const ModelSelectorScreen: React.FC<ModelSelectorScreenProps> = ({
  onSelect,
  onCancel,
}) => {
  const theme = useTheme()
  const { terminalHeight } = useTerminalDimensions()
  const selectorHeight = Math.max(6, Math.min(14, terminalHeight - 3))
  const config = useCustomProviderStore((state) => state.config)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<
    'loading' | 'ready' | 'warning'
  >('loading')

  useEffect(() => {
    const controller = new AbortController()
    void refreshProviderCatalogs({ signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return
        refreshCustomProviderStore()
        setCatalogStatus(result.warnings.length > 0 ? 'warning' : 'ready')
      },
    )
    return () => controller.abort()
  }, [])

  const sections = useMemo<ModelSection[]>(() => {
    const customSections = [...config.providers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((provider) => ({
        providerId: provider.id,
        providerName: provider.name,
        choices: [...provider.models]
          .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
          .map((model) => ({
            providerId: provider.id,
            providerName: provider.name,
            modelId: model.id,
            modelName: model.name ?? model.id,
            isCodebuff: false,
          })),
      }))

    return [
      {
        providerId: null,
        providerName: 'Codewolf',
        choices: [
          {
            providerId: null,
            providerName: 'Codewolf',
            modelId: 'default',
            modelName: 'Backend predeterminado',
            isCodebuff: true,
          },
        ],
      },
      ...customSections,
    ]
  }, [config.providers])

  const choices = useMemo(
    () => sections.flatMap((section) => section.choices),
    [sections],
  )

  const initialIndex = useMemo(() => {
    if (!config.activeProviderId) return 0
    const index = choices.findIndex(
      (choice) =>
        choice.providerId === config.activeProviderId &&
        choice.modelId === config.activeModelId,
    )
    return index >= 0 ? index : 0
  }, [choices, config.activeModelId, config.activeProviderId])

  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  useEffect(() => {
    setSelectedIndex(initialIndex)
  }, [initialIndex])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    // Each model is one row and each provider adds one header row.
    const selected = choices[selectedIndex]
    if (!selected) return
    let row = 0
    for (const section of sections) {
      row += 1
      const indexInSection = section.choices.findIndex(
        (choice) =>
          choice.providerId === selected.providerId &&
          choice.modelId === selected.modelId,
      )
      if (indexInSection >= 0) {
        row += indexInSection
        break
      }
      row += section.choices.length
    }

    const viewportHeight = scrollbox.viewport.height
    if (row < scrollbox.scrollTop) scrollbox.scrollTop = row
    if (row >= scrollbox.scrollTop + viewportHeight) {
      scrollbox.scrollTop = row - viewportHeight + 1
    }
  }, [choices, sections, selectedIndex])

  const selectChoice = useCallback(
    (choice: ModelChoice) => {
      if (choice.isCodebuff) {
        disableCustomProvider()
      } else if (choice.providerId) {
        activateCustomProviderModel(choice.providerId, choice.modelId)
      }
      refreshCustomProviderStore()
      resetCodebuffClient()
      onSelect(choice)
    },
    [onSelect],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'up') {
          setSelectedIndex((previous) => Math.max(0, previous - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((previous) =>
            Math.min(choices.length - 1, previous + 1),
          )
          return
        }
        if (isPlainEnterKey(key)) {
          const choice = choices[selectedIndex]
          if (choice) selectChoice(choice)
          return
        }
        if (key.name === 'escape') onCancel()
      },
      [choices, onCancel, selectChoice, selectedIndex],
    ),
  )

  let flatIndex = 0
  return (
    <box
      title=" Modelos por proveedor "
      titleAlignment="center"
      style={{
        width: '100%',
        height: selectorHeight,
        maxHeight: selectorHeight,
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <scrollbox
        ref={scrollRef}
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
        {sections.map((section) => (
          <box
            key={section.providerId ?? 'codewolf'}
            style={{ flexDirection: 'column' }}
          >
            <text
              style={{
                fg: theme.secondary,
                attributes: TextAttributes.BOLD,
              }}
            >
              {section.providerName}
            </text>
            {section.choices.map((choice) => {
              const choiceIndex = flatIndex++
              const isSelected = choiceIndex === selectedIndex
              const isActive = choice.isCodebuff
                ? !config.activeProviderId
                : choice.providerId === config.activeProviderId &&
                  choice.modelId === config.activeModelId

              return (
                <Button
                  key={`${choice.providerId ?? 'codewolf'}:${choice.modelId}`}
                  onClick={() => selectChoice(choice)}
                  onMouseOver={() => setSelectedIndex(choiceIndex)}
                  style={{
                    width: '100%',
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: isSelected
                      ? theme.surfaceHover
                      : 'transparent',
                  }}
                >
                  <text
                    style={{
                      fg: isSelected ? theme.foreground : theme.muted,
                      attributes: isSelected ? TextAttributes.BOLD : undefined,
                    }}
                  >
                    {isSelected ? '❯' : ' '} {isActive ? '●' : '○'}{' '}
                    {choice.modelName}
                    {choice.modelName !== choice.modelId
                      ? ` (${choice.modelId})`
                      : ''}
                  </text>
                </Button>
              )
            })}
          </box>
        ))}
      </scrollbox>
      <text style={{ fg: theme.muted }}>
        {catalogStatus === 'loading'
          ? 'Actualizando catálogos de modelos…'
          : catalogStatus === 'warning'
            ? 'Algunos catálogos usan caché · ↑↓ navegar · Enter seleccionar · Esc cancelar'
            : '↑↓ navegar · Enter seleccionar · Esc cancelar · /login agrega proveedores'}
      </text>
    </box>
  )
}
