import type { CustomProviderModel } from '../utils/custom-providers'

export const NVIDIA_NIM_PROVIDER_ID = 'nvidia-nim'
export const NVIDIA_NIM_PROVIDER_NAME = 'NVIDIA NIM'
export const NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const NVIDIA_NIM_MODELS_URL = `${NVIDIA_NIM_BASE_URL}/models`

const NVIDIA_MODEL_ALIASES = new Map<string, string>([
  ['z-ai/glm5.2', 'z-ai/glm-5.2'],
  ['z-ai/glm5.1', 'z-ai/glm-5.1'],
  ['z-ai/glm-5-2', 'z-ai/glm-5.2'],
  ['deepseek-v4-pro', 'deepseek-ai/deepseek-v4-pro'],
  ['deepseek-v4-flash', 'deepseek-ai/deepseek-v4-flash'],
  ['kimi-k2.6', 'moonshotai/kimi-k2.6'],
  ['nemotron-ultra', 'nvidia/nemotron-3-ultra-550b-a55b'],
  ['nemotron-super', 'nvidia/nemotron-3-super-120b-a12b'],
  ['qwen/qwen3-5-122b-a10b', 'qwen/qwen3.5-122b-a10b'],
  ['qwen/qwen3-5-397b-a17b', 'qwen/qwen3.5-397b-a17b'],
])

/**
 * Known high-value NVIDIA hosted chat models. This list provides metadata and
 * ordering only: a successful /models response remains authoritative.
 */
const CURRENT_NVIDIA_NIM_MODELS: CustomProviderModel[] = [
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'z-ai/glm-5.2',
    name: 'GLM-5.2',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'nvidia/nemotron-4-340b-instruct',
    name: 'Nemotron 4 340B Instruct',
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra 550B A55B',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super 120B A12B',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'Nemotron 3 Nano 30B A3B',
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    name: 'Nemotron 3 Nano Omni 30B A3B Reasoning',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'minimaxai/minimax-m3',
    name: 'MiniMax M3',
    maxContextTokens: 1_000_000,
    maxOutputTokens: 8_192,
  },
  {
    id: 'minimaxai/minimax-m2.7',
    name: 'MiniMax M2.7',
    maxContextTokens: 204_800,
    maxOutputTokens: 8_192,
  },
  {
    id: 'mistralai/mistral-medium-3.5-128b',
    name: 'Mistral Medium 3.5 128B',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'mistralai/mistral-small-4-119b-2603',
    name: 'Mistral Small 4 119B 2603',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'mistralai/mistral-large-3-675b-instruct-2512',
    name: 'Mistral Large 3 675B Instruct 2512',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'stepfun-ai/step-3.7-flash',
    name: 'Step 3.7 Flash',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    maxContextTokens: 262_144,
  },
  {
    id: 'qwen/qwen3.5-122b-a10b',
    name: 'Qwen3.5 122B A10B',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'qwen/qwen3.5-397b-a17b',
    name: 'Qwen3.5 397B A17B',
    maxContextTokens: 262_144,
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b-instruct',
    name: 'Qwen3 Coder 480B A35B Instruct',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    name: 'Qwen3 Next 80B A3B Instruct',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-thinking',
    name: 'Qwen3 Next 80B A3B Thinking',
    maxContextTokens: 262_144,
    maxOutputTokens: 16_384,
  },
  {
    id: 'mistralai/mistral-nemotron',
    name: 'Mistral Nemotron',
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
]

const NON_CHAT_MODEL_PATTERNS = [
  /embed/i,
  /(?:^|[-_/])bge(?:$|[-_/])/i,
  /rerank/i,
  /retriev/i,
  /(?:^|[-_/])ocr(?:$|[-_/])/i,
  /(?:^|[-_/])tts(?:$|[-_/])/i,
  /(?:^|[-_/])asr(?:$|[-_/])/i,
  /speech/i,
  /safety/i,
  /guard/i,
  /moderation/i,
  /topic-control/i,
  /diffusion/i,
  /cosmos/i,
  /qwen-image/i,
  /image-edit/i,
  /detector/i,
  /(?:^|[-_/])parse(?:r)?(?:$|[-_/])/i,
  /reward/i,
  /(?:^|[-_/])(?:nv)?clip(?:$|[-_/])/i,
  /deplot/i,
  /gliner/i,
  /(?:^|[-_/])pii(?:$|[-_/])/i,
  /calibration/i,
]

const CURRENT_MODEL_BY_ID = new Map(
  CURRENT_NVIDIA_NIM_MODELS.map((model) => [model.id, model]),
)
const CURRENT_MODEL_PRIORITY = new Map(
  CURRENT_NVIDIA_NIM_MODELS.map((model, index) => [model.id, index]),
)

export function normalizeNvidiaNimModelId(modelId: string): string {
  const trimmed = modelId.trim()
  return NVIDIA_MODEL_ALIASES.get(trimmed.toLowerCase()) ?? trimmed
}

export function isLikelyNvidiaNimChatModelId(modelId: string): boolean {
  const normalized = normalizeNvidiaNimModelId(modelId)
  return (
    normalized.includes('/') &&
    !NON_CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))
  )
}

function titleFromModelId(modelId: string): string {
  const name = modelId.split('/').at(-1) ?? modelId
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(?:\.\d+)*[a-z]*$/i.test(part)) return part.toUpperCase()
      if (/^[a-z]{1,4}\d+(?:\.\d+)*$/i.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

const DEFAULT_UNKNOWN_NVIDIA_CONTEXT_TOKENS = 32_768

function inferContextTokensFromModelId(modelId: string): number | undefined {
  const match = modelId.match(/(?:^|[-_/])(\d{1,4})k(?:$|[-_/])/i)
  if (!match) return undefined
  const contextTokens = Number.parseInt(match[1], 10) * 1_024
  return Number.isSafeInteger(contextTokens) && contextTokens > 0
    ? contextTokens
    : undefined
}

/**
 * Keeps every chat-capable model returned by NVIDIA, enriches known models with
 * reliable context metadata, and orders current coding/agentic models first.
 */
export function normalizeNvidiaNimModels(
  discoveredModels: CustomProviderModel[],
): CustomProviderModel[] {
  const models = new Map<string, CustomProviderModel>()

  for (const discovered of discoveredModels) {
    const id = normalizeNvidiaNimModelId(discovered.id)
    if (!id || !isLikelyNvidiaNimChatModelId(id)) continue
    const known = CURRENT_MODEL_BY_ID.get(id)
    models.set(id, {
      ...known,
      ...discovered,
      id,
      name: discovered.name?.trim() || known?.name || titleFromModelId(id),
      maxOutputTokens:
        discovered.maxOutputTokens ?? known?.maxOutputTokens,
      maxContextTokens:
        discovered.maxContextTokens ??
        known?.maxContextTokens ??
        inferContextTokensFromModelId(id) ??
        DEFAULT_UNKNOWN_NVIDIA_CONTEXT_TOKENS,
    })
  }

  return [...models.values()].sort((left, right) => {
    const leftPriority = CURRENT_MODEL_PRIORITY.get(left.id)
    const rightPriority = CURRENT_MODEL_PRIORITY.get(right.id)
    if (leftPriority !== undefined || rightPriority !== undefined) {
      return (
        (leftPriority ?? Number.MAX_SAFE_INTEGER) -
        (rightPriority ?? Number.MAX_SAFE_INTEGER)
      )
    }
    return (left.name ?? left.id).localeCompare(right.name ?? right.id)
  })
}

export function getCuratedNvidiaNimModels(): CustomProviderModel[] {
  return CURRENT_NVIDIA_NIM_MODELS.map((model) => ({ ...model }))
}

export function isNvidiaNimProviderId(providerId: string): boolean {
  return providerId.trim().toLowerCase() === NVIDIA_NIM_PROVIDER_ID
}
