/**
 * Runtime configuration for an OpenAI-compatible provider selected by a client.
 *
 * This object intentionally contains only the active provider/model and is passed
 * through the SDK for a single run. Persistent provider storage belongs to the
 * client application (for example, the CLI).
 */
export interface CustomProviderRuntimeConfig {
  /** Stable provider identifier used in logs and the status bar. */
  id: string
  /** Human-readable provider name. */
  name: string
  /** OpenAI-compatible API root, normally ending in /v1. */
  baseUrl: string
  /** Resolved API key. Empty when the endpoint does not require authentication. */
  apiKey?: string
  /** Model identifier sent to the provider. */
  modelId: string
  /** Optional additional HTTP headers required by the provider. */
  headers?: Record<string, string>
  /** Header used for the API key. Defaults to Authorization. */
  apiKeyHeader?: string
  /** Prefix placed before the API key. Defaults to Bearer. Empty disables it. */
  apiKeyPrefix?: string
  /** Whether JSON-schema structured output parameters are supported. */
  supportsStructuredOutputs?: boolean
  /** Optional maximum output token cap for this model. */
  maxOutputTokens?: number
}
