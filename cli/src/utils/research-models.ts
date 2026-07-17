import { OPENCODE_FREE_PROVIDER_ID } from '../providers/opencode-catalog'

import {
  getCustomProviderRuntimeConfig,
  loadAvailableProvidersConfig,
} from './custom-providers'
import {
  getCodeReviewerModel,
  getCodeSearcherModel,
  getFileListerModel,
  getFilePickerModel,
  getOpusModel,
  getResearchAgentModels,
  getResearchGeneralModel,
  getResearchModelMode,
} from './settings'

import type {
  ExplorationProviderOverrides,
  ResearchAgentId,
  ResearchProviderOverrides,
} from '@codebuff/common/types/custom-provider'
import type { ResearchAgentKind, ResearchModelReference } from './settings'

export const RESEARCH_AGENT_KIND_TO_ID: Record<
  ResearchAgentKind,
  ResearchAgentId
> = {
  ecosystem: 'ecosystem-researcher',
  documentation: 'researcher-docs',
  web: 'researcher-web',
}

export const RESEARCH_AGENT_LABELS: Record<ResearchAgentKind, string> = {
  ecosystem: 'Ecosistemas y librerías',
  documentation: 'Documentación oficial',
  web: 'Búsqueda web',
}

export function formatResearchModelReference(
  reference: ResearchModelReference | undefined,
  configDir?: string,
): string {
  if (!reference) return 'Sin configurar'
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find(
    (item) => item.id === reference.providerId,
  )
  const model = provider?.models.find((item) => item.id === reference.modelId)
  if (!provider || !model) {
    return `No disponible · ${reference.providerId}/${reference.modelId}`
  }
  return `${provider.name} · ${model.name ?? model.id}`
}

export function resolveModelReference(
  reference: ResearchModelReference | undefined,
  configDir?: string,
) {
  if (!reference) return undefined
  try {
    return getCustomProviderRuntimeConfig(
      reference.providerId,
      reference.modelId,
      configDir,
    )
  } catch {
    // A provider can be present while its environment-based credential is not.
    // Treat it as temporarily unavailable and continue through the fallback chain.
    return undefined
  }
}

export function getAutomaticEconomicalResearchModelReference(
  configDir?: string,
): ResearchModelReference | undefined {
  const config = loadAvailableProvidersConfig(configDir)
  const freeProvider = config.providers.find(
    (provider) => provider.id === OPENCODE_FREE_PROVIDER_ID,
  )
  const freeModel = freeProvider?.models[0]
  if (freeProvider && freeModel) {
    return { providerId: freeProvider.id, modelId: freeModel.id }
  }

  const activeProvider = config.providers.find(
    (provider) => provider.id === config.activeProviderId,
  )
  const activeModel =
    activeProvider?.models.find((model) => model.id === config.activeModelId) ??
    activeProvider?.models[0]
  if (activeProvider && activeModel) {
    return { providerId: activeProvider.id, modelId: activeModel.id }
  }

  return undefined
}

export function resolveResearchProviderOverrides(
  configDir?: string,
): ResearchProviderOverrides {
  const mode = getResearchModelMode(configDir)
  const general = getResearchGeneralModel(configDir)
  const perAgent = getResearchAgentModels(configDir)
  const automatic = getAutomaticEconomicalResearchModelReference(configDir)

  const resolveForKind = (kind: ResearchAgentKind) => {
    const candidates =
      mode === 'automatic-economical'
        ? [automatic]
        : mode === 'single-model'
          ? [general, automatic]
          : [perAgent[kind], general, automatic]
    for (const reference of candidates) {
      const resolved = resolveModelReference(reference, configDir)
      if (resolved) return resolved
    }
    return undefined
  }

  const overrides: ResearchProviderOverrides = {}
  for (const kind of Object.keys(
    RESEARCH_AGENT_KIND_TO_ID,
  ) as ResearchAgentKind[]) {
    const provider = resolveForKind(kind)
    if (provider) overrides[RESEARCH_AGENT_KIND_TO_ID[kind]] = provider
  }
  return overrides
}

/** Resolve the optional dedicated provider/model used by OPUS-class subagents. */
export function resolveOpusProviderOverride(configDir?: string) {
  return resolveModelReference(getOpusModel(configDir), configDir)
}

/** Resolve the optional dedicated provider/model used by code-reviewer agents. */
export function resolveCodeReviewerProviderOverride(configDir?: string) {
  return resolveModelReference(getCodeReviewerModel(configDir), configDir)
}

/** Resolve optional provider/model overrides for codebase exploration agents. */
export function resolveExplorationProviderOverrides(
  configDir?: string,
): ExplorationProviderOverrides {
  const overrides: ExplorationProviderOverrides = {}
  const codeSearcher = resolveModelReference(
    getCodeSearcherModel(configDir),
    configDir,
  )
  const filePicker = resolveModelReference(
    getFilePickerModel(configDir),
    configDir,
  )
  const fileLister = resolveModelReference(
    getFileListerModel(configDir),
    configDir,
  )
  if (codeSearcher) overrides['code-searcher'] = codeSearcher
  if (filePicker) overrides['file-picker'] = filePicker
  if (fileLister) overrides['file-lister'] = fileLister
  return overrides
}
