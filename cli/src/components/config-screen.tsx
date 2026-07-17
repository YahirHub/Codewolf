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
  getCodeReviewerModel,
  getCodeSearcherModel,
  getFileListerModel,
  getFilePickerModel,
  getOpusModel,
  getResearchAgentModels,
  getResearchGeneralModel,
  getResearchModelMode,
  getResearchTimeoutMinutes,
  isProjectContextEnabled,
  isVerifiedCommitsEnabled,
  setCodeReviewerModel,
  setCodeSearcherModel,
  setFileListerModel,
  setFilePickerModel,
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

type ConfigSection = 'general' | 'agents' | 'research'

const CONFIG_SECTION_LABELS: Record<ConfigSection, string> = {
  general: 'GENERAL',
  agents: 'MODELOS DE AGENTES',
  research: 'INVESTIGACIÓN',
}

type ConfigItemBase = {
  section: ConfigSection
  title: string
  description: string
}

type ToggleConfigItem = ConfigItemBase & {
  id: 'project-context' | 'verified-commits'
  kind: 'toggle'
}

type NumberConfigItem = ConfigItemBase & {
  id: 'research-timeout'
  kind: 'number'
}

type ChoiceConfigItem = ConfigItemBase & {
  id: 'research-model-mode'
  kind: 'choice'
}

type ModelTarget =
  | 'opus'
  | 'code-reviewer'
  | 'code-searcher'
  | 'file-picker'
  | 'file-lister'
  | 'general'
  | ResearchAgentKind

type ModelConfigItem = ConfigItemBase & {
  id: `research-model-${ModelTarget}`
  kind: 'model'
  target: ModelTarget
}

type ConfigItem =
  ToggleConfigItem | NumberConfigItem | ChoiceConfigItem | ModelConfigItem

const BASE_CONFIG_ITEMS: ConfigItem[] = [
  {
    id: 'project-context',
    kind: 'toggle',
    section: 'general',
    title: 'Contexto del proyecto',
    description:
      'Lee e inyecta las reglas de contexto/ y conserva la memoria técnica del proyecto.',
  },
  {
    id: 'verified-commits',
    kind: 'toggle',
    section: 'general',
    title: 'Commits verificados',
    description:
      'Solicita validar los cambios antes de crear automáticamente un commit.',
  },
  {
    id: 'research-model-opus',
    kind: 'model',
    target: 'opus',
    section: 'agents',
    title: 'Agentes OPUS',
    description:
      'Modelo de alta capacidad para razonamiento e implementación. Vacío: hereda /models.',
  },
  {
    id: 'research-model-code-reviewer',
    kind: 'model',
    target: 'code-reviewer',
    section: 'agents',
    title: 'Revisión de código',
    description:
      'Modelo para code-reviewer y sus variantes. Vacío: hereda OPUS o /models.',
  },
  {
    id: 'research-model-code-searcher',
    kind: 'model',
    target: 'code-searcher',
    section: 'agents',
    title: 'Búsqueda de código',
    description:
      'Modelo para code-searcher. Vacío: usa el modelo seleccionado en /models para la tarea.',
  },
  {
    id: 'research-model-file-picker',
    kind: 'model',
    target: 'file-picker',
    section: 'agents',
    title: 'Selección de archivos',
    description:
      'Modelo para file-picker y file-picker-max. Vacío: usa el modelo seleccionado en /models.',
  },
  {
    id: 'research-model-file-lister',
    kind: 'model',
    target: 'file-lister',
    section: 'agents',
    title: 'Listado de archivos',
    description:
      'Modelo para file-lister y file-lister-max. Vacío: usa el modelo seleccionado en /models.',
  },
  {
    id: 'research-timeout',
    kind: 'number',
    section: 'research',
    title: 'Tiempo máximo',
    description:
      'Límite de seguridad; cada investigador termina antes al reunir evidencia suficiente.',
  },
  {
    id: 'research-model-mode',
    kind: 'choice',
    section: 'research',
    title: 'Estrategia de modelos',
    description:
      'Selecciona modelos económicos automáticamente o asigna uno general o por agente.',
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

function getModelPickerTitle(target: ModelTarget): string {
  switch (target) {
    case 'opus':
      return 'Seleccionar modelo para agentes OPUS'
    case 'code-reviewer':
      return 'Seleccionar modelo para revisión de código'
    case 'code-searcher':
      return 'Seleccionar modelo para búsqueda de código'
    case 'file-picker':
      return 'Seleccionar modelo para selección de archivos'
    case 'file-lister':
      return 'Seleccionar modelo para listado de archivos'
    case 'general':
      return 'Seleccionar modelo de investigación'
    default:
      return `Modelo para ${RESEARCH_AGENT_LABELS[target]}`
  }
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
  const [codeReviewerModel, setCodeReviewerModelState] = useState(() =>
    getCodeReviewerModel(),
  )
  const [codeSearcherModel, setCodeSearcherModelState] = useState(() =>
    getCodeSearcherModel(),
  )
  const [filePickerModel, setFilePickerModelState] = useState(() =>
    getFilePickerModel(),
  )
  const [fileListerModel, setFileListerModelState] = useState(() =>
    getFileListerModel(),
  )
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
        section: 'research',
        title: 'Modelo general',
        description:
          'Se utiliza en investigación de ecosistemas, documentación y búsqueda web.',
      })
    } else if (researchModelMode === 'per-agent') {
      items.push({
        id: 'research-model-general',
        kind: 'model',
        target: 'general',
        section: 'research',
        title: 'Modelo base',
        description:
          'Se usa cuando un investigador no tiene un modelo específico.',
      })
      for (const kind of RESEARCH_AGENT_KINDS) {
        items.push({
          id: `research-model-${kind}`,
          kind: 'model',
          target: kind,
          section: 'research',
          title: RESEARCH_AGENT_LABELS[kind],
          description: `Asignación específica. Vacío: hereda el modelo base de investigación.`,
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

    // Rows are taller than a regular list because each option includes a
    // description and section headers are rendered between groups.
    let row = 0
    let previousSection: ConfigSection | undefined
    for (let index = 0; index < selectedIndex; index += 1) {
      const item = configItems[index]
      if (!item) continue
      if (item.section !== previousSection) row += 2
      row += 6
      previousSection = item.section
    }
    const selected = configItems[selectedIndex]
    if (selected && selected.section !== previousSection) row += 2
    const viewportHeight = scrollbox.viewport.height
    if (row < scrollbox.scrollTop) scrollbox.scrollTop = row
    if (row + 5 >= scrollbox.scrollTop + viewportHeight) {
      scrollbox.scrollTop = Math.max(0, row - viewportHeight + 6)
    }
  }, [configItems, selectedIndex])

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
      if (target === 'code-reviewer') return codeReviewerModel
      if (target === 'code-searcher') return codeSearcherModel
      if (target === 'file-picker') return filePickerModel
      if (target === 'file-lister') return fileListerModel
      if (target === 'general') return researchGeneralModel
      return researchAgentModels[target]
    },
    [
      codeReviewerModel,
      codeSearcherModel,
      fileListerModel,
      filePickerModel,
      opusModel,
      researchAgentModels,
      researchGeneralModel,
    ],
  )

  const setModelReference = useCallback(
    (target: ModelTarget, reference: ResearchModelReference | undefined) => {
      if (target === 'opus') {
        setOpusModel(reference)
        setOpusModelState(reference)
      } else if (target === 'code-reviewer') {
        setCodeReviewerModel(reference)
        setCodeReviewerModelState(reference)
      } else if (target === 'code-searcher') {
        setCodeSearcherModel(reference)
        setCodeSearcherModelState(reference)
      } else if (target === 'file-picker') {
        setFilePickerModel(reference)
        setFilePickerModelState(reference)
      } else if (target === 'file-lister') {
        setFileListerModel(reference)
        setFileListerModelState(reference)
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
        title={getModelPickerTitle(modelPickerTarget)}
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
      return toggleValue(item) ? 'Activado' : 'Desactivado'
    }
    if (item.kind === 'number') return `${researchTimeoutMinutes} minutos`
    if (item.kind === 'choice') return MODE_LABELS[researchModelMode]
    const reference = getModelReference(item.target)
    if (item.target === 'opus' && !reference) return 'Hereda /models'
    if (item.target === 'code-reviewer' && !reference) {
      return 'Hereda OPUS o /models'
    }
    if (
      !reference &&
      (item.target === 'code-searcher' ||
        item.target === 'file-picker' ||
        item.target === 'file-lister')
    ) {
      return 'Hereda /models'
    }
    if (item.target === 'general' && !reference) return 'Selección automática'
    if (!reference) return 'Hereda el modelo base'
    return formatResearchModelReference(reference)
  }

  const getStatusColor = (item: ConfigItem): string => {
    if (item.kind === 'toggle') {
      return toggleValue(item) ? theme.success : theme.muted
    }
    if (item.kind === 'number') return theme.info
    if (item.kind === 'choice') return theme.warning
    const status = getStatus(item)
    if (status.startsWith('No disponible')) return theme.error
    return getModelReference(item.target) ? theme.info : theme.muted
  }

  const getSectionColor = (section: ConfigSection): string => {
    if (section === 'general') return theme.primary
    if (section === 'agents') return theme.info
    return theme.warning
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
        borderColor: theme.primary,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
          Preferencias globales
        </text>
        <text style={{ fg: theme.muted }}>~/.codewolf/settings.json</text>
      </box>

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
          const previousSection = configItems[index - 1]?.section
          const showSection = previousSection !== item.section
          return (
            <React.Fragment key={item.id}>
              {showSection && (
                <box
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: index === 0 ? 1 : 2,
                    paddingLeft: 1,
                  }}
                >
                  <text
                    style={{
                      fg: getSectionColor(item.section),
                      attributes: TextAttributes.BOLD,
                    }}
                  >
                    {CONFIG_SECTION_LABELS[item.section]}
                  </text>
                </box>
              )}
              <Button
                onClick={() => activateItem(item)}
                onMouseOver={() => setSelectedIndex(index)}
                style={{
                  width: '100%',
                  minHeight: 5,
                  marginTop: 0,
                  paddingLeft: 1,
                  paddingRight: 1,
                  flexDirection: 'column',
                  borderStyle: 'single',
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected
                    ? theme.surfaceHover
                    : 'transparent',
                }}
              >
                <text
                  style={{
                    fg: theme.foreground,
                    attributes: selected ? TextAttributes.BOLD : undefined,
                  }}
                >
                  <span fg={selected ? theme.primary : theme.muted}>
                    {selected ? '❯' : '•'}{' '}
                  </span>
                  {item.title}
                </text>
                <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                  <span fg={theme.muted}>Valor: </span>
                  <span
                    fg={getStatusColor(item)}
                    attributes={TextAttributes.BOLD}
                  >
                    {getStatus(item)}
                  </span>
                </text>
                <text
                  style={{ fg: theme.muted, paddingLeft: 2, wrapMode: 'word' }}
                >
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
      {editingTimeout ? (
        <text style={{ fg: theme.muted, marginTop: 1 }}>
          <span fg={theme.success}>Enter</span>: guardar (
          {MIN_RESEARCH_TIMEOUT_MINUTES}-{MAX_RESEARCH_TIMEOUT_MINUTES} min) ·{' '}
          <span fg={theme.warning}>Esc</span>: cancelar
        </text>
      ) : (
        <text style={{ fg: theme.muted, marginTop: 1 }}>
          <span fg={theme.primary}>↑/↓</span> o{' '}
          <span fg={theme.primary}>Tab</span>: navegar ·{' '}
          <span fg={theme.info}>←/→</span>: ajustar ·{' '}
          <span fg={theme.success}>Enter</span>: cambiar ·{' '}
          <span fg={theme.warning}>Supr</span>: limpiar modelo ·{' '}
          <span fg={theme.warning}>Esc</span>: cerrar
        </text>
      )}
    </box>
  )
}
