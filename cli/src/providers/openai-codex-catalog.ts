import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_CODEX_PROVIDER_ID,
  CHATGPT_CODEX_PROVIDER_NAME,
} from '@codebuff/common/constants/chatgpt-oauth'

import type { CustomProviderDefinition } from '../utils/custom-providers'

/**
 * Current Codex subscription models documented by OpenAI.
 * The ChatGPT account/workspace remains authoritative for actual access.
 */
export const OPENAI_CODEX_MODELS: CustomProviderDefinition['models'] = [
  {
    id: 'openai/gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.5',
    name: 'GPT-5.5',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.4',
    name: 'GPT-5.4',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.4-mini',
    name: 'GPT-5.4 mini',
    maxContextTokens: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'openai/gpt-5.3-codex-spark',
    name: 'GPT-5.3 Codex Spark (Pro)',
    maxContextTokens: 128_000,
    maxOutputTokens: 128_000,
  },
]

export function createOpenAICodexProvider(): CustomProviderDefinition {
  return {
    id: CHATGPT_CODEX_PROVIDER_ID,
    name: CHATGPT_CODEX_PROVIDER_NAME,
    baseUrl: CHATGPT_BACKEND_BASE_URL,
    models: OPENAI_CODEX_MODELS.map((model) => ({ ...model })),
    supportsStructuredOutputs: true,
  }
}

export function isOpenAICodexProviderId(providerId: string): boolean {
  return providerId.trim().toLowerCase() === CHATGPT_CODEX_PROVIDER_ID
}
