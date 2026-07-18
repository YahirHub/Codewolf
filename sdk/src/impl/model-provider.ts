/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - Custom provider: Direct requests to a user-configured OpenAI-compatible endpoint
 * - ChatGPT OAuth: Direct requests to OpenAI API using user's OAuth token
 * - No implicit backend fallback: a direct provider must be configured
 */

import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_CODEX_PROVIDER_ID,
  CHATGPT_OAUTH_ENABLED,
  isChatGptOAuthModelAllowed,
  isOpenAIProviderModel,
  toOpenAIModelId,
} from '@codebuff/common/constants/chatgpt-oauth'
import { isTransientNetworkError } from '@codebuff/common/util/error'
import {
  checkInternetConnection,
  waitForInternetConnection,
} from '@codebuff/common/util/internet-connectivity'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/llm-providers/openai-compatible'
import { APICallError } from 'ai'

import { getValidChatGptOAuthCredentials } from '../credentials'
import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
} from './chatgpt-backend-fetch'

import type { CustomProviderRuntimeConfig } from '@codebuff/common/types/custom-provider'
import type { LanguageModel } from 'ai'

// ============================================================================
// ChatGPT OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when ChatGPT OAuth rate limit expires, or null if not rate-limited */
let chatGptOAuthRateLimitedUntil: number | null = null

/**
 * Mark ChatGPT OAuth as rate-limited. Subsequent direct OAuth requests fail
 * clearly until the reset time instead of changing routes implicitly.
 */
export function markChatGptOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  chatGptOAuthRateLimitedUntil = resetAt
    ? resetAt.getTime()
    : fiveMinutesFromNow
}

/**
 * Check if ChatGPT OAuth is currently rate-limited.
 */
export function isChatGptOAuthRateLimited(): boolean {
  if (chatGptOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= chatGptOAuthRateLimitedUntil) {
    chatGptOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the ChatGPT OAuth rate-limit cache.
 * Call this when user reconnects their ChatGPT subscription.
 */
export function resetChatGptOAuthRateLimit(): void {
  chatGptOAuthRateLimitedUntil = null
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Runtime key/sentinel retained for SDK compatibility; not sent to Codebuff. */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** If true, skip opportunistic ChatGPT OAuth resolution. */
  skipChatGptOAuth?: boolean
  /** Cost mode retained for compatibility with existing callers. */
  costMode?: string
  /** Optional custom OpenAI-compatible provider/model override. */
  customProvider?: CustomProviderRuntimeConfig
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses ChatGPT OAuth direct (affects cost tracking) */
  isChatGptOAuth: boolean
  /** Whether this request is routed directly to a custom provider. */
  isCustomProvider: boolean
}


/**
 * Get the appropriate model for a request.
 *
 * Resolves an explicitly configured direct provider. There is no implicit
 * Codebuff backend fallback.
 *
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(
  params: ModelRequestParams,
): Promise<ModelResult> {
  const { apiKey, model, skipChatGptOAuth, customProvider } = params

  if (customProvider?.id === CHATGPT_CODEX_PROVIDER_ID) {
    if (!isChatGptOAuthModelAllowed(customProvider.modelId)) {
      throw new Error(
        `El modelo ${customProvider.modelId} no está habilitado para la suscripción de Codex. Selecciona otro modelo en /models.`,
      )
    }
    if (isChatGptOAuthRateLimited()) {
      throw new Error(
        'La suscripción de Codex alcanzó temporalmente su límite. Espera a que se restablezca e inténtalo de nuevo.',
      )
    }

    const credentials = await getValidChatGptOAuthCredentials()
    if (!credentials) {
      throw new Error(
        'La sesión de ChatGPT/Codex no está disponible o no pudo renovarse. Vuelve a iniciar sesión desde /login.',
      )
    }

    return {
      model: createOpenAIOAuthModel(
        customProvider.modelId,
        credentials.accessToken,
      ),
      isChatGptOAuth: true,
      isCustomProvider: false,
    }
  }

  if (customProvider) {
    return {
      model: createCustomProviderModel(customProvider),
      isChatGptOAuth: false,
      isCustomProvider: true,
    }
  }

  // The CLI uses this sentinel whenever a custom provider is active. Reaching
  // this branch means a parent run failed to propagate its provider context to
  // a subagent. Never fall through to the original backend: that produced a
  // misleading HTTP 401 and made a healthy Tavily configuration look broken.
  if (apiKey.startsWith('local-custom-provider:')) {
    throw new Error(
      'Error interno: el proveedor personalizado activo no se propagó al agente secundario. Reinicia Codewolf con la versión corregida.',
    )
  }

  // Check if we should use ChatGPT OAuth direct
  // Only attempt for allowlisted models; non-allowlisted models continue to the explicit-provider requirement.
  if (
    CHATGPT_OAUTH_ENABLED &&
    !skipChatGptOAuth &&
    isOpenAIProviderModel(model) &&
    isChatGptOAuthModelAllowed(model)
  ) {
    // There is no backend fallback. Keep the original OAuth failure explicit
    // instead of silently changing routes or ending with a generic no-provider error.
    if (isChatGptOAuthRateLimited()) {
      throw new Error(
        'ChatGPT rate limit reached. Please wait a few minutes and try again.',
      )
    }

    const chatGptOAuthCredentials = await getValidChatGptOAuthCredentials()

    if (chatGptOAuthCredentials) {
      return {
        model: createOpenAIOAuthModel(
          model,
          chatGptOAuthCredentials.accessToken,
        ),
        isChatGptOAuth: true,
        isCustomProvider: false,
      }
    }

    throw new Error(
      'ChatGPT OAuth credentials unavailable. Please reconnect from /login.',
    )
  }

  throw new Error(
    'No hay un proveedor directo configurado para esta solicitud. Codewolf ya no utiliza el backend heredado de Codebuff como fallback. Configura un proveedor con /login y selecciónalo con /models.',
  )
}

/**
 * Create an OpenAI model that routes through the ChatGPT backend API (Codex endpoint).
 * Uses a custom fetch that transforms between Chat Completions and Responses API formats.
 */
function createOpenAIOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  const openAIModelId = toOpenAIModelId(model)
  const accountId = extractChatGptAccountId(oauthToken)

  return new OpenAICompatibleChatLanguageModel(openAIModelId, {
    provider: 'openai',
    url: () => `${CHATGPT_BACKEND_BASE_URL}/codex/responses`,
    headers: () => ({
      Authorization: `Bearer ${oauthToken}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      accept: 'text/event-stream',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff-chatgpt-oauth`,
      ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
    }),
    fetch: createInternetRecoveryFetch(
      createChatGptBackendFetch() as typeof globalThis.fetch,
    ),
    supportsStructuredOutputs: true,
    includeUsage: undefined,
  })
}

/**
 * Wrap global fetch so transient connection failures (socket closed/reset,
 * connection refused) are rethrown as retryable APICallErrors.
 *
 * Bun's fetch throws these as plain Errors ("The socket connection was closed
 * unexpectedly...", code ECONNRESET/ConnectionClosed), which the AI SDK does
 * not recognize as retryable — it only auto-retries APICallError with
 * isRetryable=true. Marking them retryable lets streamText's built-in
 * exponential backoff (default 2 retries) absorb brief server/network blips
 * instead of failing the whole agent run.
 */
function getFetchSignal(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): AbortSignal | undefined {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined)
}

/**
 * Retry provider transport requests indefinitely only when the machine is
 * actually offline. If public Internet is reachable, the original provider
 * error is rethrown as retryable for the AI SDK's bounded retry policy. This
 * keeps provider outages, bad endpoints, rate limits, and HTTP errors distinct
 * from a real loss of Internet connectivity.
 */
export function createInternetRecoveryFetch(
  baseFetch?: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return (async (...args: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = args
    const signal = getFetchSignal(input, init)
    const requestTemplate = input instanceof Request ? input.clone() : null

    while (true) {
      try {
        const attemptInput = requestTemplate ? requestTemplate.clone() : input
        return await (baseFetch ?? globalThis.fetch)(attemptInput, init)
      } catch (error) {
        if (!isTransientNetworkError(error)) throw error

        const internetAvailable = await checkInternetConnection({ signal })
        if (!internetAvailable) {
          await waitForInternetConnection({ signal })
          continue
        }

        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        throw new APICallError({
          message: error instanceof Error ? error.message : String(error),
          cause: error,
          url,
          requestBodyValues: {},
          isRetryable: true,
        })
      }
    }
  }) as typeof globalThis.fetch
}

const fetchWithInternetRecovery = createInternetRecoveryFetch()

function createCustomProviderModel(
  config: CustomProviderRuntimeConfig,
): LanguageModel {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const apiKeyHeader = config.apiKeyHeader?.trim() || 'Authorization'
  const apiKeyPrefix = config.apiKeyPrefix ?? 'Bearer'
  const authValue = config.apiKey
    ? apiKeyPrefix
      ? `${apiKeyPrefix} ${config.apiKey}`
      : config.apiKey
    : undefined

  return new OpenAICompatibleChatLanguageModel(config.modelId, {
    provider: `custom-${config.id}`,
    url: ({ path: endpoint }) => `${baseUrl}${endpoint}`,
    headers: () => ({
      ...(authValue ? { [apiKeyHeader]: authValue } : {}),
      ...(config.headers ?? {}),
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codewolf-custom-provider`,
    }),
    fetch: fetchWithInternetRecovery as typeof globalThis.fetch,
    includeUsage: undefined,
    supportsStructuredOutputs: config.supportsStructuredOutputs ?? false,
    useNonStreamingForDoStream: config.useNonStreaming ?? false,
    // Custom gateways such as CommandCode can coerce empty assistant content
    // to null before validating the request. Keep replayed tool/reasoning
    // messages as non-empty strings so interrupted sessions remain usable.
    requireNonEmptyAssistantContent: true,
  })
}
