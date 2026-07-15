import {
  NVIDIA_NIM_BASE_URL,
  NVIDIA_NIM_PROVIDER_ID,
  NVIDIA_NIM_PROVIDER_NAME,
  normalizeNvidiaNimModels,
} from '../providers/nvidia-nim-catalog'
import {
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

export async function discoverNvidiaNimModels(params: {
  apiKey: string
  signal?: AbortSignal
}): Promise<CustomProviderModel[]> {
  const apiKey = params.apiKey.trim()
  if (!apiKey) throw new Error('Escribe una API key de NVIDIA NIM.')

  const discovered = await discoverCustomProviderModels({
    baseUrl: NVIDIA_NIM_BASE_URL,
    signal: params.signal,
  })
  const models = normalizeNvidiaNimModels(discovered)
  if (models.length === 0) {
    throw new Error(
      'NVIDIA no devolvió modelos de chat compatibles en /models.',
    )
  }
  return models
}

export async function configureNvidiaNim(params: {
  apiKey: string
  configDir?: string
  signal?: AbortSignal
}): Promise<CustomProviderDefinition> {
  const apiKey = params.apiKey.trim()
  const models = await discoverNvidiaNimModels({
    apiKey,
    signal: params.signal,
  })

  return upsertCustomProvider({
    id: NVIDIA_NIM_PROVIDER_ID,
    name: NVIDIA_NIM_PROVIDER_NAME,
    baseUrl: NVIDIA_NIM_BASE_URL,
    apiKeyInput: apiKey,
    models,
    useNonStreaming: true,
    configDir: params.configDir,
  })
}

export async function refreshNvidiaNimModels(params: {
  configDir?: string
  signal?: AbortSignal
} = {}): Promise<CustomProviderModel[] | null> {
  const config = loadAvailableProvidersConfig(params.configDir)
  const provider = config.providers.find(
    (item) => item.id === NVIDIA_NIM_PROVIDER_ID,
  )
  if (!provider) return null

  const apiKey = getCustomProviderApiKey(
    NVIDIA_NIM_PROVIDER_ID,
    params.configDir,
  )
  if (!apiKey) return null

  const models = await discoverNvidiaNimModels({
    apiKey,
    signal: params.signal,
  })
  updateCustomProvider({
    id: NVIDIA_NIM_PROVIDER_ID,
    name: NVIDIA_NIM_PROVIDER_NAME,
    baseUrl: NVIDIA_NIM_BASE_URL,
    models,
    configDir: params.configDir,
  })
  return models
}
