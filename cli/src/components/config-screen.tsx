import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { ModelSelectorScreen } from './model-selector-screen'
import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { resetCodebuffClient } from '../utils/codebuff-client'
import {
  RESEARCH_AGENT_LABELS,
  formatResearchModelReference,
} from '../utils/research-models'
import {
  MAX_RESEARCH_TIMEOUT_MINUTES,
  MIN_RESEARCH_TIMEOUT_MINUTES,
  RESEARCH_AGENT_KINDS,
  RESEARCH_MODEL_MODES,
  getOpusModel,
  getResearchAgentModels,
  getResearchGeneralModel,
  getResearchModelMode,
  getResearchTimeoutMinutes,
  isProjectContextEnabled,
  isVerifiedCommitsEnabled,
  setOpusModel,
  setProjectContextEnabled,
  setResearchAgentModel,
  setResearchGeneralModel,
  setResearchModelMode,
  setResearchTimeoutMinutes,
  setVerifiedCommitsEnabled,
} from '../utils/settings'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type { ModelChoice } from './model-selector-screen'
import type { InputValue } from '../types/store'
import type {
  ResearchAgentKind,
  ResearchModelMode,
  ResearchModelReference,
} from '../utils/settings'
import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

interface ConfigScreenProps {
  onClose: () => void
  onProjectContextChanged?: (enabled: boolean) => void
}

type ToggleConfigItem = {
  id: 'project-context' | 'verified-commits'
  kind: 'toggle'
  title: string
  description: string
}

type NumberConfigItem = {
  id: 'research-timeout'
  kind: 'number'
  title: string
  description: string
}

type ChoiceConfigItem = {
  id: 'research-model-mode'
  kind: 'choice'
  title: string
  description: string
}

type ModelTarget = 'opus' | 'general' | ResearchAgentKind

type ModelConfigItem = {
  id: `research-model-${ModelTarget}`
  kind: 'model'
  target: ModelTarget
  title: string
  description: string
}

type ConfigItem =
  ToggleConfigItem | NumberConfigItem | ChoiceConfigItem | ModelConfigItem

const BASE_CONFIG_ITEMS: ConfigItem[] = [
  {
    id: 'project-context',
    kind: 'toggle',
    title: 'Contexto persistente del proyecto',
    description:
      'Resume contexto/, inyecta sus reglas en cada turno y mantiene registros técnicos después de cambios importantes.',
  },
  {
    id: 'verified-commits',
    kind: 'toggle',
    title: 'Commits automáticos verificados',
    description:
      'Después de editar, pide probar los cambios y solo crea el commit cuando confirmas que funcionan.',
  },
  {
    id: 'research-model-opus',
    kind: 'model',
    target: 'opus',
    title: 'Modelo para agentes OPUS',
    description:
      'Se usa en los subagentes de razonamiento, implementación y revisión de alta capacidad. Si se deja vacío, hereda el modelo activo de /models.',
  },
  {
    id: 'research-timeout',
    kind: 'number',
    title: 'Tiempo máximo de investigación',
    description:
      'Límite de seguridad para agentes de búsqueda y documentación. El agente termina antes cuando ya reunió evidencia suficiente.',
  },
  {
    id: 'research-model-mode',
    kind: 'choice',
    title: 'Asignación de modelos de investigación',
    description:
      'Usa OpenCode Free automáticamente, un solo modelo para todos o modelos distintos por investigador.',
  },
]

const MODE_LABELS: Record<ResearchModelMode, string> = {
  'automatic-economical': 'AUTOMÁTICO ECONÓMICO',
  'single-model': 'UN MODELO PARA TODOS',
  'per-agent': 'MODELOS POR AGENTE',
}

function clampResearchMinutes(value: number): number {
  return Math.max(
    MIN_RESEARCH_TIMEOUT_MINUTES,
    Math.min(MAX_RESEARCH_TIMEOUT_MINUTES, Math.round(value)),
  )
}

function modelReferenceFromChoice(
  choice: ModelChoice,
): ResearchModelReference | undefined {
  if (!choice.providerId || choice.isCodebuff) return undefined
  return { providerId: choice.providerId, modelId: choice.modelId }
}

export const ConfigScreen: React.FC<ConfigScreenProps> = ({
  onClose,
  onProjectContextChanged,
}) => {
  const theme = useTheme()
  const { terminalHeight } = useTerminalDimensions()
  const configHeight = Math.max(12, terminalHeight - 3)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projectContextEnabled, setProjectContextState] = useState(() =>
    isProjectContextEnabled(),
  )
  const [verifiedCommitsEnabled, setVerifiedCommitsState] = useState(() =>
    isVerifiedCommitsEnabled(),
  )
  const [researchTimeoutMinutes, setResearchTimeoutState] = useState(() =>
    getResearchTimeoutMinutes(),
  )
  const [researchModelMode, setResearchModelModeState] = useState(() =>
    getResearchModelMode(),
  )
  const [opusModel, setOpusModelState] = useState(() => getOpusModel())
  const [researchGeneralModel, setResearchGeneralModelState] = useState(() =>
    getResearchGeneralModel(),
  )
  const [researchAgentModels, setResearchAgentModelsState] = useState(() =>
    getResearchAgentModels(),
  )
  const [editingTimeout, setEditingTimeout] = useState(false)
  const [modelPickerTarget, setModelPickerTarget] =
    useState<ModelTarget | null>(null)
  const [timeoutInput, setTimeoutInput] = useState<InputValue>(() => {
    const text = String(getResearchTimeoutMinutes())
    return { text, cursorPosition: text.length, lastEditDueToNav: false }
  })
  const [timeoutError, setTimeoutError] = useState<string | null>(null)

  const configItems = useMemo<ConfigItem[]>(() => {
    const items = [...BASE_CONFIG_ITEMS]
    if (researchModelMode === 'single-model') {
      items.push({
        id: 'research-model-general',
        kind: 'model',
        target: 'general',
        title: 'Modelo general de investigación',
        description:
          'Se utilizará para ecosistemas, documentación y búsqueda web.',
      })
    } else if (researchModelMode === 'per-agent') {
      items.push({
        id: 'research-model-general',
        kind: 'model',
        target: 'general',
        title: 'Modelo base de investigación',
        description:
          'Se usa cuando un investigador no tiene un modelo específico.',
      })
      for (const kind of RESEARCH_AGENT_KINDS) {
        items.push({
          id: `research-model-${kind}`,
          kind: 'model',
          target: kind,
          title: RESEARCH_AGENT_LABELS[kind],
          description: `Modelo específico para ${RESEARCH_AGENT_LABELS[kind].toLowerCase()}; si se deja vacío hereda el modelo base.`,
        })
      }
    }
    return items
  }, [researchModelMode])

  useEffect(() => {
    setSelectedIndex((current) =>
      Math.max(0, Math.min(current, configItems.length - 1)),
    )
  }, [configItems.length])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    // Each option occupies roughly four rows including its margin.
    const row = selectedIndex * 4
    const viewportHeight = scrollbox.viewport.height
    if (row < scrollbox.scrollTop) scrollbox.scrollTop = row
    if (row + 3 >= scrollbox.scrollTop + viewportHeight) {
      scrollbox.scrollTop = Math.max(0, row - viewportHeight + 4)
    }
  }, [selectedIndex])

  const saveResearchTimeout = useCallback((minutes: number) => {
    const normalized = clampResearchMinutes(minutes)
    setResearchTimeoutMinutes(normalized)
    setResearchTimeoutState(normalized)
    const text = String(normalized)
    setTimeoutInput({
      text,
      cursorPosition: text.length,
      lastEditDueToNav: false,
    })
    setTimeoutError(null)
  }, [])

  const submitTimeout = useCallback(() => {
    const value = Number.parseInt(timeoutInput.text.trim(), 10)
    if (!Number.isFinite(value)) {
      setTimeoutError('Escribe una cantidad válida de minutos.')
      return
    }
    saveResearchTimeout(value)
    setEditingTimeout(false)
  }, [saveResearchTimeout, timeoutInput.text])

  const toggle = useCallback(
    (item: ToggleConfigItem) => {
      if (item.id === 'project-context') {
        const next = !projectContextEnabled
        setProjectContextEnabled(next)
        setProjectContextState(next)
        onProjectContextChanged?.(next)
        return
      }

      const next = !verifiedCommitsEnabled
      setVerifiedCommitsEnabled(next)
      setVerifiedCommitsState(next)
    },
    [onProjectContextChanged, projectContextEnabled, verifiedCommitsEnabled],
  )

  const cycleResearchMode = useCallback((direction = 1) => {
    setResearchModelModeState((current) => {
      const index = RESEARCH_MODEL_MODES.indexOf(current)
      const next =
        RESEARCH_MODEL_MODES[
          (index + direction + RESEARCH_MODEL_MODES.length) %
            RESEARCH_MODEL_MODES.length
        ] ?? 'automatic-economical'
      setResearchModelMode(next)
      resetCodebuffClient()
      return next
    })
    setSelectedIndex((current) =>
      Math.min(current, BASE_CONFIG_ITEMS.length - 1),
    )
  }, [])

  const getModelReference = useCallback(
    (target: ModelTarget): ResearchModelReference | undefined => {
      if (target === 'opus') return opusModel
      if (target === 'general') return researchGeneralModel
      return researchAgentModels[target]
    },
    [opusModel, researchAgentModels, researchGeneralModel],
  )

  const setModelReference = useCallback(
    (target: ModelTarget, reference: ResearchModelReference | undefined) => {
      if (target === 'opus') {
        setOpusModel(reference)
        setOpusModelState(reference)
      } else if (target === 'general') {
        setResearchGeneralModel(reference)
        setResearchGeneralModelState(reference)
      } else {
        setResearchAgentModel(target, reference)
        setResearchAgentModelsState((current) => {
          const next = { ...current }
          if (reference) next[target] = reference
          else delete next[target]
          return next
        })
      }
      resetCodebuffClient()
    },
    [],
  )

  const activateItem = useCallback(
    (item: ConfigItem) => {
      if (item.kind === 'toggle') {
        toggle(item)
        return
      }
      if (item.kind === 'choice') {
        cycleResearchMode(1)
        return
      }
      if (item.kind === 'model') {
        setModelPickerTarget(item.target)
        return
      }
      setTimeoutError(null)
      const text = String(researchTimeoutMinutes)
      setTimeoutInput({
        text,
        cursorPosition: text.length,
        lastEditDueToNav: false,
      })
      setEditingTimeout(true)
    },
    [cycleResearchMode, researchTimeoutMinutes, toggle],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (editingTimeout || modelPickerTarget) return
        if (key.name === 'escape') {
          onClose()
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((current) =>
            current === 0 ? configItems.length - 1 : current - 1,
          )
          return
        }
        if (key.name === 'down' || key.name === 'tab') {
          setSelectedIndex((current) => (current + 1) % configItems.length)
          return
        }

        const selected = configItems[selectedIndex]
        if (!selected) return
        if (key.name === 'left' || key.name === 'right') {
          if (selected.kind === 'number') {
            saveResearchTimeout(
              researchTimeoutMinutes + (key.name === 'left' ? -1 : 1),
            )
            return
          }
          if (selected.kind === 'choice') {
            cycleResearchMode(key.name === 'left' ? -1 : 1)
            return
          }
        }
        if (
          selected.kind === 'model' &&
          (key.name === 'backspace' || key.name === 'delete')
        ) {
          setModelReference(selected.target, undefined)
          return
        }
        if (isPlainEnterKey(key) || key.name === 'space') {
          activateItem(selected)
        }
      },
      [
        activateItem,
        configItems,
        cycleResearchMode,
        editingTimeout,
        modelPickerTarget,
        onClose,
        researchTimeoutMinutes,
        saveResearchTimeout,
        selectedIndex,
        setModelReference,
      ],
    ),
  )

  if (modelPickerTarget) {
    const selectedReference = getModelReference(modelPickerTarget)
    return (
      <ModelSelectorScreen
        title={
          modelPickerTarget === 'opus'
            ? 'Seleccionar modelo para agentes OPUS'
            : modelPickerTarget === 'general'
              ? 'Seleccionar modelo de investigación'
              : `Modelo para ${RESEARCH_AGENT_LABELS[modelPickerTarget]}`
        }
        selectionMode="pick"
        includeCodewolf={false}
        selectedChoice={
          selectedReference
            ? {
                providerId: selectedReference.providerId,
                modelId: selectedReference.modelId,
              }
            : undefined
        }
        onSelect={(choice) => {
          setModelReference(modelPickerTarget, modelReferenceFromChoice(choice))
          setModelPickerTarget(null)
        }}
        onCancel={() => setModelPickerTarget(null)}
      />
    )
  }

  const toggleValue = (item: ToggleConfigItem): boolean =>
    item.id === 'project-context'
      ? projectContextEnabled
      : verifiedCommitsEnabled

  const getStatus = (item: ConfigItem): string => {
    if (item.kind === 'toggle') {
      return toggleValue(item) ? '● ACTIVADO' : '○ DESACTIVADO'
    }
    if (item.kind === 'number') return `${researchTimeoutMinutes} MINUTOS`
    if (item.kind === 'choice') return MODE_LABELS[researchModelMode]
    const reference = getModelReference(item.target)
    if (item.target === 'opus' && !reference) return 'HEREDA /models'
    return formatResearchModelReference(reference)
  }

  return (
    <box
      title=" Configuración "
      titleAlignment="center"
      style={{
        width: '100%',
        height: configHeight,
        maxHeight: configHeight,
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.muted }}>
        Estas opciones se guardan en ~/.codewolf/settings.json y se aplican a
        todos los proyectos.
      </text>

      <scrollbox
        ref={scrollRef}
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: { width: 1 },
        }}
        style={{
          flexGrow: 1,
          rootOptions: {
            flexDirection: 'row',
            backgroundColor: 'transparent',
          },
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
        {configItems.map((item, index) => {
          const selected = index === selectedIndex
          return (
            <React.Fragment key={item.id}>
              <Button
                onClick={() => activateItem(item)}
                onMouseOver={() => setSelectedIndex(index)}
                style={{
                  width: '100%',
                  minHeight: 3,
                  marginTop: 1,
                  paddingLeft: 1,
                  paddingRight: 1,
                  flexDirection: 'column',
                  backgroundColor: selected
                    ? theme.surfaceHover
                    : 'transparent',
                }}
              >
                <text
                  style={{
                    fg: selected ? theme.foreground : theme.muted,
                    attributes: selected ? TextAttributes.BOLD : undefined,
                  }}
                >
                  {selected ? '❯' : ' '} {getStatus(item)} · {item.title}
                </text>
                <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                  {item.description}
                </text>
              </Button>

              {item.kind === 'number' && selected && editingTimeout && (
                <box
                  style={{
                    width: '100%',
                    borderStyle: 'single',
                    borderColor: timeoutError ? theme.error : theme.primary,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <MultilineInput
                    value={timeoutInput.text}
                    cursorPosition={timeoutInput.cursorPosition}
                    onChange={(next) => {
                      const digits = next.text.replace(/\D/g, '').slice(0, 3)
                      setTimeoutInput({
                        text: digits,
                        cursorPosition: Math.min(
                          next.cursorPosition,
                          digits.length,
                        ),
                        lastEditDueToNav: false,
                      })
                      setTimeoutError(null)
                    }}
                    onSubmit={submitTimeout}
                    onPaste={(text = '') => {
                      const digits = text.replace(/\D/g, '')
                      if (!digits) return
                      const next = `${timeoutInput.text}${digits}`.slice(0, 3)
                      setTimeoutInput({
                        text: next,
                        cursorPosition: next.length,
                        lastEditDueToNav: false,
                      })
                    }}
                    onKeyIntercept={(key) => {
                      if (key.name === 'escape') {
                        setEditingTimeout(false)
                        setTimeoutError(null)
                        return true
                      }
                      return false
                    }}
                    placeholder="Minutos"
                    focused={true}
                    maxHeight={1}
                    minHeight={1}
                  />
                </box>
              )}
            </React.Fragment>
          )
        })}
      </scrollbox>

      {timeoutError && <text style={{ fg: theme.error }}>{timeoutError}</text>}
      <text style={{ fg: theme.muted, marginTop: 1 }}>
        {editingTimeout
          ? `Enter: guardar (${MIN_RESEARCH_TIMEOUT_MINUTES}-${MAX_RESEARCH_TIMEOUT_MINUTES} min) · Esc: cancelar`
          : '↑/↓ o Tab: navegar · ←/→: ajustar · Enter: cambiar · Supr: limpiar modelo · Esc: cerrar'}
      </text>
    </box>
  )
}
