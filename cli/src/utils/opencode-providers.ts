import {
  OPENCODE_FREE_BASE_URL,
  OPENCODE_FREE_PROVIDER_ID,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_GO_PROVIDER_NAME,
  filterOpenCodeFreeModels,
  saveOpenCodeFreeModelCache,
  updateOpenCodeFreeModels,
} from '../providers/opencode-catalog'
import {
  activateCustomProviderModel,
  discoverCustomProviderModels,
  getCustomProviderApiKey,
  loadAvailableProvidersConfig,
  updateCustomProvider,
  upsertCustomProvider,
} from './custom-providers'

import type {
  CustomProviderDefinition,
  CustomProviderModel,
} from './custom-providers'

export interface OpenCodeProviderRefreshResult {
  freeModels: CustomProviderModel[]
  goModels: CustomProviderModel[] | null
  warnings: string[]
}

export async function refreshOpenCodeFreeModels(params: {
  configDir?: string
  signal?: AbortSignal
} = {}): Promise<CustomProviderModel[]> {
  const discovered = await discoverCustomProviderModels({
    baseUrl: OPENCODE_FREE_BASE_URL,
    signal: params.signal,
  })
  const freeModels = filterOpenCodeFreeModels(discovered)
  if (freeModels.length === 0) {
    throw new Error('OpenCode no devolvió modelos con terminación -free.')
  }

  const models = updateOpenCodeFreeModels(freeModels)
  saveOpenCodeFreeModelCache(models, params.configDir)
  const config = loadAvailableProvidersConfig(params.configDir)
  if (
    config.activeProviderId === OPENCODE_FREE_PROVIDER_ID &&
    !models.some((model) => model.id === config.activeModelId)
  ) {
    activateCustomProviderModel(
      OPENCODE_FREE_PROVIDER_ID,
      models[0]!.id,
      params.configDir,
    )
  }
  return models
}

export async function configureOpenCodeGo(params: {
  apiKey: string
  configDir?: string
  signal?: AbortSignal
}): Promise<CustomProviderDefinition> {
  const apiKey = params.apiKey.trim()
  if (!apiKey) throw new Error('Escribe una API key de OpenCode Go.')

  const models = await discoverCustomProviderModels({
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKey,
    signal: params.signal,
  })

  return upsertCustomProvider({
    id: OPENCODE_GO_PROVIDER_ID,
    name: OPENCODE_GO_PROVIDER_NAME,
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyInput: apiKey,
    models,
    configDir: params.configDir,
  })
}

export async function refreshOpenCodeGoModels(params: {
  configDir?: string
  signal?: AbortSignal
} = {}): Promise<CustomProviderModel[] | null> {
  const config = loadAvailableProvidersConfig(params.configDir)
  const provider = config.providers.find(
    (item) => item.id === OPENCODE_GO_PROVIDER_ID,
  )
  if (!provider) return null

  const apiKey = getCustomProviderApiKey(
    OPENCODE_GO_PROVIDER_ID,
    params.configDir,
  )
  if (!apiKey) return null

  const models = await discoverCustomProviderModels({
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKey,
    signal: params.signal,
  })
  updateCustomProvider({
    id: OPENCODE_GO_PROVIDER_ID,
    name: OPENCODE_GO_PROVIDER_NAME,
    baseUrl: OPENCODE_GO_BASE_URL,
    models,
    configDir: params.configDir,
  })
  return models
}

export async function refreshBundledOpenCodeProviders(params: {
  configDir?: string
  signal?: AbortSignal
} = {}): Promise<OpenCodeProviderRefreshResult> {
  const [freeResult, goResult] = await Promise.allSettled([
    refreshOpenCodeFreeModels(params),
    refreshOpenCodeGoModels(params),
  ])
  const warnings: string[] = []

  const freeModels =
    freeResult.status === 'fulfilled' ? freeResult.value : []
  if (freeResult.status === 'rejected') {
    warnings.push(
      `OpenCode Free: ${
        freeResult.reason instanceof Error
          ? freeResult.reason.message
          : String(freeResult.reason)
      }`,
    )
  }

  const goModels = goResult.status === 'fulfilled' ? goResult.value : null
  if (goResult.status === 'rejected') {
    warnings.push(
      `OpenCode Go: ${
        goResult.reason instanceof Error
          ? goResult.reason.message
          : String(goResult.reason)
      }`,
    )
  }

  return { freeModels, goModels, warnings }
}
