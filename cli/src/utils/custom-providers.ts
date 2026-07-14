import fs from 'fs'
import path from 'path'

import { z } from 'zod'

import { getConfigDir } from './config-dir'

import type { CustomProviderRuntimeConfig } from '@codebuff/common/types/custom-provider'

const PROVIDERS_FILE_VERSION = 1 as const
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000

const modelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
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
  const ids = input
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)

  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) {
    throw new Error('Debes indicar al menos un modelo.')
  }

  return uniqueIds.map((id) => ({ id }))
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
  const config = loadCustomProvidersConfig(configDir)
  const provider = config.providers.find((item) => item.id === id)
  if (!provider) throw new Error(`No existe el proveedor ${id}.`)

  const selectedModel = provider.models.some(
    (model) => model.id === config.activeModelId,
  )
    ? config.activeModelId
    : provider.models[0]!.id

  saveCustomProvidersConfig(
    {
      ...config,
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
  const config = loadCustomProvidersConfig(configDir)
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
      ...config,
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
  const config = loadCustomProvidersConfig(configDir)
  if (!config.activeProviderId) {
    throw new Error('No hay un proveedor personalizado activo.')
  }
  return activateCustomProviderModel(config.activeProviderId, modelId, configDir)
}

export function removeCustomProvider(
  providerId: string,
  configDir = getConfigDir(),
): boolean {
  const id = normalizeCustomProviderId(providerId)
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

export function getActiveCustomProviderRuntimeConfig(
  configDir = getConfigDir(),
): CustomProviderRuntimeConfig | undefined {
  const config = loadCustomProvidersConfig(configDir)
  const provider = config.providers.find(
    (item) => item.id === config.activeProviderId,
  )
  if (!provider) return undefined

  const model =
    provider.models.find((item) => item.id === config.activeModelId) ??
    provider.models[0]
  if (!model) throw new Error(`El proveedor ${provider.name} no tiene modelos.`)

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
    maxOutputTokens: model.maxOutputTokens,
  }
}

export function formatCustomProviderStatus(
  config = loadCustomProvidersConfig(),
): string {
  const provider = config.providers.find(
    (item) => item.id === config.activeProviderId,
  )
  if (!provider)
    return 'Backend heredado (sin proveedor personalizado activo).'
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
    models.set(id, { id, ...(name ? { name } : {}) })
  }
  return [...models.values()]
}

export async function discoverCustomProviderModels(params: {
  baseUrl: string
  apiKey?: string
  signal?: AbortSignal
}): Promise<CustomProviderModel[]> {
  const baseUrl = normalizeCustomProviderBaseUrl(params.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS)
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
      throw new Error('La respuesta de /models no contiene modelos reconocibles.')
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
