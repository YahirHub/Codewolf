import fs from 'fs'
import path from 'path'

import { getConfigDir } from '../utils/config-dir'

import type {
  CustomProviderDefinition,
  CustomProviderModel,
} from '../utils/custom-providers'

export const OPENCODE_FREE_PROVIDER_ID = 'opencode-free'
export const OPENCODE_FREE_PROVIDER_NAME = 'OpenCode Free'
export const OPENCODE_FREE_BASE_URL = 'https://opencode.ai/zen/v1'
export const OPENCODE_FREE_MODELS_URL = `${OPENCODE_FREE_BASE_URL}/models`

export const OPENCODE_GO_PROVIDER_ID = 'opencode-go'
export const OPENCODE_GO_PROVIDER_NAME = 'OpenCode Go'
export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_GO_MODELS_URL = `${OPENCODE_GO_BASE_URL}/models`

const OPENCODE_MODELS_CACHE_VERSION = 1 as const
const OPENCODE_MODELS_CACHE_FILE = 'opencode-models.json'

const FALLBACK_FREE_MODELS: CustomProviderModel[] = [
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (Free)' },
  { id: 'mimo-v2.5-free', name: 'MiMo V2.5 (Free)' },
  { id: 'hy3-free', name: 'HY3 (Free)' },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (Free)' },
  { id: 'north-mini-code-free', name: 'North Mini Code (Free)' },
]

let currentFreeModels = FALLBACK_FREE_MODELS.map((model) => ({ ...model }))

export function getOpenCodeModelsCachePath(
  configDir = getConfigDir(),
): string {
  return path.join(configDir, OPENCODE_MODELS_CACHE_FILE)
}

export function loadOpenCodeFreeModelCache(
  configDir = getConfigDir(),
): CustomProviderModel[] {
  try {
    const cachePath = getOpenCodeModelsCachePath(configDir)
    if (!fs.existsSync(cachePath)) return getOpenCodeFreeModels()
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      version?: unknown
      freeModels?: unknown
    }
    if (
      raw.version !== OPENCODE_MODELS_CACHE_VERSION ||
      !Array.isArray(raw.freeModels)
    ) {
      return getOpenCodeFreeModels()
    }
    const parsed = filterOpenCodeFreeModels(
      raw.freeModels.filter(
        (item): item is CustomProviderModel =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as { id?: unknown }).id === 'string',
      ),
    )
    if (parsed.length > 0) currentFreeModels = parsed
  } catch {
    // The static fallback remains available when the cache is invalid.
  }
  return getOpenCodeFreeModels()
}

export function saveOpenCodeFreeModelCache(
  models: CustomProviderModel[],
  configDir = getConfigDir(),
): void {
  const filtered = filterOpenCodeFreeModels(models)
  if (filtered.length === 0) return
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const cachePath = getOpenCodeModelsCachePath(configDir)
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(
      {
        version: OPENCODE_MODELS_CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        freeModels: filtered,
      },
      null,
      2,
    )}
`,
    { mode: 0o600 },
  )
  fs.renameSync(tempPath, cachePath)
  currentFreeModels = filtered
}

function titleFromModelId(modelId: string): string {
  return modelId
    .replace(/-free$/i, '')
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^v?\d+(?:\.\d+)*$/i.test(part)) return part.toUpperCase()
      if (/^[a-z]{1,3}\d+$/i.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

export function isOpenCodeFreeModelId(modelId: string): boolean {
  return modelId.trim().toLowerCase().endsWith('-free')
}

export function filterOpenCodeFreeModels(
  models: CustomProviderModel[],
): CustomProviderModel[] {
  const unique = new Map<string, CustomProviderModel>()
  for (const model of models) {
    const id = model.id.trim()
    if (!isOpenCodeFreeModelId(id)) continue
    if (unique.has(id)) continue
    unique.set(id, {
      ...model,
      id,
      name: model.name?.trim() || `${titleFromModelId(id)} (Free)`,
    })
  }
  return [...unique.values()]
}

export function updateOpenCodeFreeModels(
  discoveredModels: CustomProviderModel[],
): CustomProviderModel[] {
  const filtered = filterOpenCodeFreeModels(discoveredModels)
  if (filtered.length > 0) {
    currentFreeModels = filtered.map((model) => ({ ...model }))
  }
  return getOpenCodeFreeModels()
}

export function getOpenCodeFreeModels(): CustomProviderModel[] {
  return currentFreeModels.map((model) => ({ ...model }))
}

export function createOpenCodeFreeProvider(
  configDir = getConfigDir(),
): CustomProviderDefinition {
  loadOpenCodeFreeModelCache(configDir)
  return {
    id: OPENCODE_FREE_PROVIDER_ID,
    name: OPENCODE_FREE_PROVIDER_NAME,
    baseUrl: OPENCODE_FREE_BASE_URL,
    models: getOpenCodeFreeModels(),
  }
}

export function isOpenCodeFreeProviderId(providerId: string): boolean {
  return providerId.trim().toLowerCase() === OPENCODE_FREE_PROVIDER_ID
}

export function isBundledOpenCodeProviderId(providerId: string): boolean {
  const normalized = providerId.trim().toLowerCase()
  return (
    normalized === OPENCODE_FREE_PROVIDER_ID ||
    normalized === OPENCODE_GO_PROVIDER_ID
  )
}
