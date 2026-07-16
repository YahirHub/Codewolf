/**
 * ChatGPT subscription OAuth constants for direct Codex routing.
 */

/** Enables ChatGPT subscription authentication and direct Codex requests. */
export const CHATGPT_OAUTH_ENABLED = true

/** Reserved bundled provider identity used by /login and /models. */
export const CHATGPT_CODEX_PROVIDER_ID = 'openai-codex'
export const CHATGPT_CODEX_PROVIDER_NAME =
  'ChatGPT Plus/Pro (Codex Subscription)'

/** OAuth client id used by the official Codex-compatible login flow. */
export const CHATGPT_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/** OAuth endpoints. */
export const CHATGPT_OAUTH_AUTHORIZE_URL =
  'https://auth.openai.com/oauth/authorize'
export const CHATGPT_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

/** Device-code endpoints used by headless Codex login. */
export const CHATGPT_DEVICE_USER_CODE_URL =
  'https://auth.openai.com/api/accounts/deviceauth/usercode'
export const CHATGPT_DEVICE_TOKEN_URL =
  'https://auth.openai.com/api/accounts/deviceauth/token'
export const CHATGPT_DEVICE_VERIFICATION_URL =
  'https://auth.openai.com/codex/device'
export const CHATGPT_DEVICE_REDIRECT_URI =
  'https://auth.openai.com/deviceauth/callback'

/** Pinned redirect URI for the local browser callback flow. */
export const CHATGPT_OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback'

/** Base URL for the ChatGPT Codex backend API. */
export const CHATGPT_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api'

/** Environment variable for an OAuth access-token override. */
export const CHATGPT_OAUTH_TOKEN_ENV_VAR = 'CODEBUFF_CHATGPT_OAUTH_TOKEN'

/**
 * OpenRouter-style IDs used internally by Codewolf and their direct Codex IDs.
 * The first entries are the current selectable catalog. Legacy entries remain
 * routable only so existing sessions do not break after an upgrade.
 */
export const OPENROUTER_TO_OPENAI_MODEL_MAP: Record<string, string> = {
  'openai/gpt-5.6-sol': 'gpt-5.6-sol',
  'openai/gpt-5.6-terra': 'gpt-5.6-terra',
  'openai/gpt-5.6-luna': 'gpt-5.6-luna',
  'openai/gpt-5.5': 'gpt-5.5',
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.3-codex-spark': 'gpt-5.3-codex-spark',

  // Legacy session compatibility. These are intentionally not shown in the
  // bundled /models catalog.
  'openai/gpt-5.4-codex': 'gpt-5.4-codex',
  'openai/gpt-5.3': 'gpt-5.3',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.2': 'gpt-5.2',
  'openai/gpt-5.2-codex': 'gpt-5.2-codex',
  'openai/gpt-5.1': 'gpt-5.1',
  'openai/gpt-5.1-chat': 'gpt-5.1-chat',
  'openai/gpt-4o-2024-11-20': 'gpt-4o-2024-11-20',
  'openai/gpt-4o-mini-2024-07-18': 'gpt-4o-mini-2024-07-18',
}

export const CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST = Object.keys(
  OPENROUTER_TO_OPENAI_MODEL_MAP,
) as Array<keyof typeof OPENROUTER_TO_OPENAI_MODEL_MAP>

export function isOpenAIProviderModel(model: string): boolean {
  return model.startsWith('openai/')
}

export function isChatGptOAuthModelAllowed(model: string): boolean {
  return model in OPENROUTER_TO_OPENAI_MODEL_MAP
}

export function toOpenAIModelId(model: string): string {
  if (!model.includes('/')) return model

  if (!model.startsWith('openai/')) {
    throw new Error(
      `Cannot convert non-OpenAI model to OpenAI model ID: ${model}`,
    )
  }

  const mapped = OPENROUTER_TO_OPENAI_MODEL_MAP[model]
  if (mapped) return mapped

  throw new Error(
    `Model is not supported for ChatGPT OAuth direct routing: ${model}`,
  )
}
