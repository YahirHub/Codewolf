import fs from 'fs'
import path from 'path'

import { z } from 'zod'

import { CHATGPT_CODEX_PROVIDER_ID } from '@codebuff/common/constants/chatgpt-oauth'
import { getChatGptOAuthCredentials } from '@codebuff/sdk'

import { getConfigDir } from './config-dir'
import {
  OPENCODE_FREE_PROVIDER_ID,
  createOpenCodeFreeProvider,
  isOpenCodeFreeProviderId,
} from '../providers/opencode-catalog'
import {
  createOpenAICodexProvider,
  isOpenAICodexProviderId,
} from '../providers/openai-codex-catalog'

import {
  CONTEXT_COMPACTION_RATIO,
  getContextCompactionThreshold,
} from '@codebuff/common/types/custom-provider'

import type { CustomProviderRuntimeConfig } from '@codebuff/common/types/custom-provider'

const PROVIDERS_FILE_VERSION = 1 as const
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000
const DEFAULT_CUSTOM_MODEL_CONTEXT_TOKENS = 400_000
const DEEPSEEK_DEFAULT_CONTEXT_TOKENS = 1_000_000

export { CONTEXT_COMPACTION_RATIO, getContextCompactionThreshold }

const modelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxContextTokens: z.number().int().positive().optional(),
})

const providerSchema = z.object({
  id: z.string().regex(PROVIDER_ID_PATTERN),
  name: z.string().trim().min(1),
  baseUrl: z.string().url(),
  models: z.array(modelSchema).min(1),
  apiKeyEnv: z.string().regex(ENV_NAME_PATTERN).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  apiKeyHeader: z.string().trim().min(1).optional(),
  apiKeyPrefix: z.string().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  useNonStreaming: z.boolean().optional(),
})

const providersFileSchema = z.object({
  version: z.literal(PROVIDERS_FILE_VERSION),
  activeProviderId: z.string().optional(),
  activeModelId: z.string().optional(),
  providers: z.array(providerSchema),
})

const authFileSchema = z.object({
  version: z.literal(PROVIDERS_FILE_VERSION),
  apiKeys: z.record(z.string(), z.string()),
})

export type CustomProviderModel = z.infer<typeof modelSchema>
export type CustomProviderDefinition = z.infer<typeof providerSchema>
export type CustomProvidersConfig = z.infer<typeof providersFileSchema>

type ProviderAuthConfig = z.infer<typeof authFileSchema>

const EMPTY_CONFIG: CustomProvidersConfig = {
  version: PROVIDERS_FILE_VERSION,
  providers: [],
}

const EMPTY_AUTH: ProviderAuthConfig = {
  version: PROVIDERS_FILE_VERSION,
  apiKeys: {},
}

export function getCustomProvidersPath(configDir = getConfigDir()): string {
  return path.join(configDir, 'providers.json')
}

export function getCustomProviderAuthPath(configDir = getConfigDir()): string {
  return path.join(configDir, 'provider-auth.json')
}

function ensureConfigDir(configDir: string): void {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
}

function writeJsonAtomic(filePath: string, value: unknown, mode = 0o600): void {
  const directory = path.dirname(filePath)
  ensureConfigDir(directory)
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode })
  fs.renameSync(tempPath, filePath)
  try {
    fs.chmodSync(filePath, mode)
  } catch {
    // Windows does not enforce POSIX modes; the file remains in the user config directory.
  }
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return undefined
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function normalizeCustomProviderBaseUrl(input: string): string {
  const parsed = new URL(input.trim())
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('La URL debe usar http:// o https://.')
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/+$/, '')

  return parsed.toString().replace(/\/$/, '')
}

export function createCustomProviderId(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  if (!normalized) {
    throw new Error('El nombre debe contener al menos una letra o número.')
  }
  return normalizeCustomProviderId(normalized)
}

export function normalizeCustomProviderId(input: string): string {
  const id = input.trim().toLowerCase()
  if (!PROVIDER_ID_PATTERN.test(id)) {
    throw new Error(
      'El identificador debe usar letras minúsculas, números y guiones (máximo 64 caracteres).',
    )
  }
  return id
}

export function parseCustomProviderModels(
  input: string,
): CustomProviderModel[] {
  const entries = input
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)

  const uniqueModels = new Map<string, CustomProviderModel>()
  for (const entry of entries) {
    const match = entry.match(/^(.+?)\s*=\s*([\d_]+)$/)
    if (entry.includes('=') && !match) {
      throw new Error(
        `El modelo "${entry}" debe usar el formato modelo=tokens.`,
      )
    }

    const id = (match?.[1] ?? entry).trim()
    const maxContextTokens = match
      ? Number.parseInt(match[2]!.replaceAll('_', ''), 10)
      : undefined

    if (!id) continue
    if (
      match &&
      (!Number.isSafeInteger(maxContextTokens) || maxContextTokens! <= 0)
    ) {
      throw new Error(`El límite de contexto de ${id} no es válido.`)
    }

    const previous = uniqueModels.get(id)
    uniqueModels.set(id, {
      ...previous,
      id,
      ...(maxContextTokens ? { maxContextTokens } : {}),
    })
  }

  if (uniqueModels.size === 0) {
    throw new Error('Debes indicar al menos un modelo.')
  }

  return [...uniqueModels.values()]
}

export function formatCustomProviderModelsInput(
  models: CustomProviderModel[],
): string {
  return models
    .map((model) =>
      model.maxContextTokens
        ? `${model.id}=${model.maxContextTokens}`
        : model.id,
    )
    .join(', ')
}

export function resolveCustomModelMaxContextTokens(
  model: Pick<CustomProviderModel, 'id' | 'maxContextTokens'>,
): number {
  if (model.maxContextTokens) return model.maxContextTokens
  if (model.id.toLowerCase().includes('deepseek')) {
    return DEEPSEEK_DEFAULT_CONTEXT_TOKENS
  }
  return DEFAULT_CUSTOM_MODEL_CONTEXT_TOKENS
}

function normalizeModels(
  models: string | CustomProviderModel[],
): CustomProviderModel[] {
  if (typeof models === 'string') return parseCustomProviderModels(models)

  const unique = new Map<string, CustomProviderModel>()
  for (const model of models) {
    const parsed = modelSchema.parse(model)
    if (!unique.has(parsed.id)) unique.set(parsed.id, parsed)
  }
  if (unique.size === 0) throw new Error('Debes indicar al menos un modelo.')
  return [...unique.values()]
}

export function loadCustomProvidersConfig(
  configDir = getConfigDir(),
): CustomProvidersConfig {
  try {
    const raw = readJsonFile(getCustomProvidersPath(configDir))
    if (raw === undefined) return { ...EMPTY_CONFIG, providers: [] }
    const parsed = providersFileSchema.safeParse(raw)
    return parsed.success ? parsed.data : { ...EMPTY_CONFIG, providers: [] }
  } catch {
    return { ...EMPTY_CONFIG, providers: [] }
  }
}

/**
 * Returns user-configured providers plus the temporary bundled OpenCode Free
 * catalog. The bundled provider is never written to providers.json, which
 * keeps this integration isolated and easy to remove later.
 */
export function loadAvailableProvidersConfig(
  configDir = getConfigDir(),
): CustomProvidersConfig {
  const persisted = loadCustomProvidersConfig(configDir)
  const bundledProviders = [
    createOpenCodeFreeProvider(configDir),
    ...(getChatGptOAuthCredentials() ? [createOpenAICodexProvider()] : []),
  ]
  const reservedProviderIds = new Set([
    OPENCODE_FREE_PROVIDER_ID,
    CHATGPT_CODEX_PROVIDER_ID,
  ])
  const providers = [
    ...bundledProviders,
    ...persisted.providers.filter(
      (provider) => !reservedProviderIds.has(provider.id),
    ),
  ]

  const hasPersistedConfig = fs.existsSync(getCustomProvidersPath(configDir))
  const activeProviderId =
    persisted.activeProviderId ??
    (!hasPersistedConfig ? OPENCODE_FREE_PROVIDER_ID : undefined)
  const activeProvider = providers.find(
    (provider) => provider.id === activeProviderId,
  )
  const activeModelId = activeProvider
    ? activeProvider.models.some(
        (model) => model.id === persisted.activeModelId,
      )
      ? persisted.activeModelId
      : activeProvider.models[0]?.id
    : undefined

  return {
    ...persisted,
    providers,
    activeProviderId,
    activeModelId,
  }
}

function loadProviderAuth(configDir = getConfigDir()): ProviderAuthConfig {
  try {
    const raw = readJsonFile(getCustomProviderAuthPath(configDir))
    if (raw === undefined) return { ...EMPTY_AUTH, apiKeys: {} }
    const parsed = authFileSchema.safeParse(raw)
    return parsed.success ? parsed.data : { ...EMPTY_AUTH, apiKeys: {} }
  } catch {
    return { ...EMPTY_AUTH, apiKeys: {} }
  }
}

export function saveCustomProvidersConfig(
  config: CustomProvidersConfig,
  configDir = getConfigDir(),
): void {
  const parsed = providersFileSchema.parse(config)
  writeJsonAtomic(getCustomProvidersPath(configDir), parsed)
}

function saveProviderAuth(
  auth: ProviderAuthConfig,
  configDir = getConfigDir(),
): void {
  writeJsonAtomic(getCustomProviderAuthPath(configDir), auth, 0o600)
}

export function upsertCustomProvider(params: {
  id?: string
  baseUrl: string
  apiKeyInput?: string
  models: string | CustomProviderModel[]
  name?: string
  headers?: Record<string, string>
  apiKeyHeader?: string
  apiKeyPrefix?: string
  supportsStructuredOutputs?: boolean
  useNonStreaming?: boolean
  configDir?: string
}): CustomProviderDefinition {
  const configDir = params.configDir ?? getConfigDir()
  const requestedName = params.name?.trim()
  if (!params.id?.trim() && !requestedName) {
    throw new Error('Debes indicar el nombre del proveedor.')
  }
  const id = normalizeCustomProviderId(
    params.id?.trim() || createCustomProviderId(requestedName!),
  )
  if (isOpenCodeFreeProviderId(id) || isOpenAICodexProviderId(id)) {
    throw new Error(`El identificador ${id} está reservado por Codewolf.`)
  }
  const baseUrl = normalizeCustomProviderBaseUrl(params.baseUrl)
  const models = normalizeModels(params.models)
  const apiKeyInput = params.apiKeyInput?.trim() ?? ''
  const existingConfig = loadCustomProvidersConfig(configDir)
  const existing = existingConfig.providers.find(
    (provider) => provider.id === id,
  )
  const auth = loadProviderAuth(configDir)

  let apiKeyEnv: string | undefined
  if (!apiKeyInput || apiKeyInput.toLowerCase() === 'none') {
    delete auth.apiKeys[id]
  } else if (apiKeyInput.toLowerCase().startsWith('env:')) {
    const envName = apiKeyInput.slice(4).trim()
    if (!ENV_NAME_PATTERN.test(envName)) {
      throw new Error('El nombre de variable de entorno no es válido.')
    }
    apiKeyEnv = envName
    delete auth.apiKeys[id]
  } else {
    auth.apiKeys[id] = apiKeyInput
  }

  const provider: CustomProviderDefinition = providerSchema.parse({
    ...existing,
    id,
    name: requestedName || existing?.name || id,
    baseUrl,
    models,
    apiKeyEnv,
    headers: params.headers ?? existing?.headers,
    apiKeyHeader: params.apiKeyHeader ?? existing?.apiKeyHeader,
    apiKeyPrefix: params.apiKeyPrefix ?? existing?.apiKeyPrefix,
    supportsStructuredOutputs:
      params.supportsStructuredOutputs ?? existing?.supportsStructuredOutputs,
    useNonStreaming: params.useNonStreaming ?? existing?.useNonStreaming,
  })

  const providers = existing
    ? existingConfig.providers.map((item) => (item.id === id ? provider : item))
    : [...existingConfig.providers, provider]

  saveCustomProvidersConfig(
    {
      version: PROVIDERS_FILE_VERSION,
      providers,
      activeProviderId: id,
      activeModelId: models[0]!.id,
    },
    configDir,
  )
  saveProviderAuth(auth, configDir)
  return provider
}

export function setActiveCustomProvider(
  providerId: string,
  configDir = getConfigDir(),
): CustomProviderDefinition {
  const id = normalizeCustomProviderId(providerId)
  const persistedConfig = loadCustomProvidersConfig(configDir)
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find((item) => item.id === id)
  if (!provider) throw new Error(`No existe el proveedor ${id}.`)

  const selectedModel = provider.models.some(
    (model) => model.id === config.activeModelId,
  )
    ? config.activeModelId
    : provider.models[0]!.id

  saveCustomProvidersConfig(
    {
      ...persistedConfig,
      activeProviderId: id,
      activeModelId: selectedModel,
    },
    configDir,
  )
  return provider
}

export function activateCustomProviderModel(
  providerId: string,
  modelId: string,
  configDir = getConfigDir(),
): CustomProviderModel {
  const id = normalizeCustomProviderId(providerId)
  const persistedConfig = loadCustomProvidersConfig(configDir)
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find((item) => item.id === id)
  if (!provider) throw new Error(`No existe el proveedor ${id}.`)

  const normalizedModelId = modelId.trim()
  const model = provider.models.find((item) => item.id === normalizedModelId)
  if (!model) {
    throw new Error(
      `El modelo ${normalizedModelId} no está configurado en ${provider.name}.`,
    )
  }

  saveCustomProvidersConfig(
    {
      ...persistedConfig,
      activeProviderId: provider.id,
      activeModelId: model.id,
    },
    configDir,
  )
  return model
}

export function disableCustomProvider(configDir = getConfigDir()): void {
  const config = loadCustomProvidersConfig(configDir)
  saveCustomProvidersConfig(
    {
      ...config,
      activeProviderId: undefined,
      activeModelId: undefined,
    },
    configDir,
  )
}

export function setActiveCustomProviderModel(
  modelId: string,
  configDir = getConfigDir(),
): CustomProviderModel {
  const config = loadAvailableProvidersConfig(configDir)
  if (!config.activeProviderId) {
    throw new Error('No hay un proveedor personalizado activo.')
  }
  return activateCustomProviderModel(
    config.activeProviderId,
    modelId,
    configDir,
  )
}

export type CustomProviderAuthStatus =
  | { type: 'stored'; label: 'API key guardada' }
  | { type: 'environment'; label: string; envName: string; available: boolean }
  | { type: 'subscription'; label: 'Suscripción conectada' }
  | { type: 'none'; label: 'Sin autenticación' }

export function getCustomProviderAuthStatuses(
  providerIds: string[],
  configDir = getConfigDir(),
): Record<string, CustomProviderAuthStatus> {
  const normalizedIds = providerIds.map((providerId) =>
    normalizeCustomProviderId(providerId),
  )
  const config = loadCustomProvidersConfig(configDir)
  const providersById = new Map(
    config.providers.map((provider) => [provider.id, provider] as const),
  )
  const auth = loadProviderAuth(configDir)
  const statuses: Record<string, CustomProviderAuthStatus> = {}

  for (const id of normalizedIds) {
    if (isOpenCodeFreeProviderId(id)) {
      statuses[id] = { type: 'none', label: 'Sin autenticación' }
      continue
    }
    if (isOpenAICodexProviderId(id)) {
      statuses[id] = { type: 'subscription', label: 'Suscripción conectada' }
      continue
    }

    const provider = providersById.get(id)
    if (!provider) continue
    if (provider.apiKeyEnv) {
      statuses[id] = {
        type: 'environment',
        label: process.env[provider.apiKeyEnv]
          ? `Variable ${provider.apiKeyEnv}`
          : `Variable ${provider.apiKeyEnv} no disponible`,
        envName: provider.apiKeyEnv,
        available: Boolean(process.env[provider.apiKeyEnv]),
      }
      continue
    }
    statuses[id] = auth.apiKeys[id]
      ? { type: 'stored', label: 'API key guardada' }
      : { type: 'none', label: 'Sin autenticación' }
  }

  return statuses
}

export function getCustomProviderAuthStatus(
  providerId: string,
  configDir = getConfigDir(),
): CustomProviderAuthStatus {
  const id = normalizeCustomProviderId(providerId)
  const status = getCustomProviderAuthStatuses([id], configDir)[id]
  if (!status) throw new Error(`No existe el proveedor ${id}.`)
  return status
}

export function getCustomProviderApiKey(
  providerId: string,
  configDir = getConfigDir(),
): string | undefined {
  const id = normalizeCustomProviderId(providerId)
  if (isOpenCodeFreeProviderId(id)) return undefined
  const config = loadCustomProvidersConfig(configDir)
  const provider = config.providers.find((item) => item.id === id)
  if (!provider) throw new Error(`No existe el proveedor ${id}.`)
  if (provider.apiKeyEnv) return process.env[provider.apiKeyEnv]
  return loadProviderAuth(configDir).apiKeys[id]
}

export function updateCustomProvider(params: {
  id: string
  name: string
  baseUrl: string
  models: string | CustomProviderModel[]
  /** Undefined preserves the current credential. Use "none" to remove it. */
  apiKeyInput?: string
  configDir?: string
}): CustomProviderDefinition {
  const configDir = params.configDir ?? getConfigDir()
  const id = normalizeCustomProviderId(params.id)
  if (isOpenCodeFreeProviderId(id)) {
    throw new Error('OpenCode Free se administra automáticamente.')
  }
  const config = loadCustomProvidersConfig(configDir)
  const existing = config.providers.find((provider) => provider.id === id)
  if (!existing) throw new Error(`No existe el proveedor ${id}.`)

  const name = params.name.trim()
  if (!name) throw new Error('Debes indicar el nombre del proveedor.')
  const baseUrl = normalizeCustomProviderBaseUrl(params.baseUrl)
  const models = normalizeModels(params.models)
  const auth = loadProviderAuth(configDir)
  let apiKeyEnv = existing.apiKeyEnv

  if (params.apiKeyInput !== undefined) {
    const input = params.apiKeyInput.trim()
    if (!input || input.toLowerCase() === 'none') {
      apiKeyEnv = undefined
      delete auth.apiKeys[id]
    } else if (input.toLowerCase().startsWith('env:')) {
      const envName = input.slice(4).trim()
      if (!ENV_NAME_PATTERN.test(envName)) {
        throw new Error('El nombre de variable de entorno no es válido.')
      }
      apiKeyEnv = envName
      delete auth.apiKeys[id]
    } else {
      apiKeyEnv = undefined
      auth.apiKeys[id] = input
    }
  }

  const provider = providerSchema.parse({
    ...existing,
    id,
    name,
    baseUrl,
    models,
    apiKeyEnv,
  })

  const activeModelId =
    config.activeProviderId === id
      ? models.some((model) => model.id === config.activeModelId)
        ? config.activeModelId
        : models[0]!.id
      : config.activeModelId

  saveCustomProvidersConfig(
    {
      ...config,
      providers: config.providers.map((item) =>
        item.id === id ? provider : item,
      ),
      activeModelId,
    },
    configDir,
  )
  saveProviderAuth(auth, configDir)
  return provider
}

export function removeCustomProvider(
  providerId: string,
  configDir = getConfigDir(),
): boolean {
  const id = normalizeCustomProviderId(providerId)
  if (isOpenCodeFreeProviderId(id) || isOpenAICodexProviderId(id)) return false
  const config = loadCustomProvidersConfig(configDir)
  if (!config.providers.some((provider) => provider.id === id)) return false

  const providers = config.providers.filter((provider) => provider.id !== id)
  const wasActive = config.activeProviderId === id
  saveCustomProvidersConfig(
    {
      version: PROVIDERS_FILE_VERSION,
      providers,
      activeProviderId: wasActive ? undefined : config.activeProviderId,
      activeModelId: wasActive ? undefined : config.activeModelId,
    },
    configDir,
  )

  const auth = loadProviderAuth(configDir)
  delete auth.apiKeys[id]
  saveProviderAuth(auth, configDir)
  return true
}

export function getCustomProviderRuntimeConfig(
  providerId: string,
  modelId: string,
  configDir = getConfigDir(),
): CustomProviderRuntimeConfig | undefined {
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find((item) => item.id === providerId)
  if (!provider) return undefined

  const model = provider.models.find((item) => item.id === modelId)
  if (!model) return undefined

  const auth = loadProviderAuth(configDir)
  const apiKey = provider.apiKeyEnv
    ? process.env[provider.apiKeyEnv]
    : auth.apiKeys[provider.id]

  if (provider.apiKeyEnv && !apiKey) {
    throw new Error(
      `Falta la variable de entorno ${provider.apiKeyEnv} para ${provider.name}.`,
    )
  }

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey,
    modelId: model.id,
    headers: provider.headers,
    apiKeyHeader: provider.apiKeyHeader,
    apiKeyPrefix: provider.apiKeyPrefix,
    supportsStructuredOutputs: provider.supportsStructuredOutputs,
    useNonStreaming: provider.useNonStreaming,
    maxOutputTokens: model.maxOutputTokens,
    maxContextTokens: resolveCustomModelMaxContextTokens(model),
  }
}

export function getActiveCustomProviderRuntimeConfig(
  configDir = getConfigDir(),
): CustomProviderRuntimeConfig | undefined {
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find(
    (item) => item.id === config.activeProviderId,
  )
  if (!provider) return undefined

  const model =
    provider.models.find((item) => item.id === config.activeModelId) ??
    provider.models[0]
  if (!model) throw new Error(`El proveedor ${provider.name} no tiene modelos.`)

  return getCustomProviderRuntimeConfig(provider.id, model.id, configDir)
}

export function getActiveCustomProviderCompactionThreshold(
  configDir = getConfigDir(),
): number | undefined {
  const config = loadAvailableProvidersConfig(configDir)
  const provider = config.providers.find(
    (item) => item.id === config.activeProviderId,
  )
  if (!provider) return undefined

  const model =
    provider.models.find((item) => item.id === config.activeModelId) ??
    provider.models[0]
  if (!model) return undefined

  return getContextCompactionThreshold(
    resolveCustomModelMaxContextTokens(model),
  )
}

export function formatCustomProviderStatus(
  config = loadAvailableProvidersConfig(),
): string {
  const provider = config.providers.find(
    (item) => item.id === config.activeProviderId,
  )
  if (!provider) return 'Backend heredado (sin proveedor personalizado activo).'
  const model =
    provider.models.find((item) => item.id === config.activeModelId) ??
    provider.models[0]
  return `${provider.name} · ${model?.name ?? model?.id ?? 'sin modelo'}`
}

function getModelDiscoveryItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const record = payload as Record<string, unknown>
  for (const key of ['data', 'models', 'results']) {
    if (Array.isArray(record[key])) return record[key]
  }
  return []
}

function parseDiscoveredModels(payload: unknown): CustomProviderModel[] {
  const models = new Map<string, CustomProviderModel>()
  for (const item of getModelDiscoveryItems(payload)) {
    if (typeof item === 'string' && item.trim()) {
      models.set(item.trim(), { id: item.trim() })
      continue
    }
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const idCandidate =
      typeof record.id === 'string'
        ? record.id
        : typeof record.model === 'string'
          ? record.model
          : undefined
    const id = idCandidate?.trim()
    if (!id) continue

    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : undefined
    const maxContextTokens = getDiscoveredContextTokens(record)
    const previous = models.get(id)
    models.set(id, {
      ...previous,
      id,
      ...(name ? { name } : {}),
      ...(maxContextTokens ? { maxContextTokens } : {}),
    })
  }
  return [...models.values()]
}

function getDiscoveredContextTokens(
  record: Record<string, unknown>,
): number | undefined {
  const candidates = [
    record.context_length,
    record.context_window,
    record.max_context_length,
    record.max_model_len,
    record.max_position_embeddings,
  ]

  for (const candidate of candidates) {
    const parsed =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Number.parseInt(candidate.replaceAll('_', ''), 10)
          : Number.NaN
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

export async function discoverCustomProviderModels(params: {
  baseUrl: string
  apiKey?: string
  signal?: AbortSignal
}): Promise<CustomProviderModel[]> {
  const baseUrl = normalizeCustomProviderBaseUrl(params.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    MODEL_DISCOVERY_TIMEOUT_MS,
  )
  const onAbort = () => controller.abort()
  params.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (params.apiKey?.trim()) {
      headers.Authorization = `Bearer ${params.apiKey.trim()}`
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      let detail = ''
      try {
        const body = await response.text()
        detail = body.trim().slice(0, 300)
      } catch {
        // Ignore unreadable bodies.
      }
      throw new Error(
        `La API respondió ${response.status}${detail ? `: ${detail}` : '.'}`,
      )
    }

    const payload = (await response.json()) as unknown
    const models = parseDiscoveredModels(payload)
    if (models.length === 0) {
      throw new Error(
        'La respuesta de /models no contiene modelos reconocibles.',
      )
    }
    return models
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('La consulta a /models agotó el tiempo de espera.')
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timeout)
    params.signal?.removeEventListener('abort', onAbort)
  }
}
