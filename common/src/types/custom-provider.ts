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
  /**
   * Use a regular JSON chat-completions request even when the caller asks for
   * streaming. This is required by providers such as NVIDIA NIM whose public
   * OpenAI-compatible streams may end without a final finish_reason chunk.
   */
  useNonStreaming?: boolean
  /** Optional maximum output token cap for this model. */
  maxOutputTokens?: number
  /** Maximum context window supported by the selected model. */
  maxContextTokens?: number
}

export const RESEARCH_AGENT_IDS = [
  'ecosystem-researcher',
  'researcher-docs',
  'researcher-web',
] as const

export type ResearchAgentId = (typeof RESEARCH_AGENT_IDS)[number]

/** Per-research-agent provider/model overrides resolved by the host application. */
export type ResearchProviderOverrides = Partial<
  Record<ResearchAgentId, CustomProviderRuntimeConfig>
>

export const EXPLORATION_AGENT_KINDS = [
  'code-searcher',
  'file-picker',
  'file-lister',
] as const

export type ExplorationAgentKind = (typeof EXPLORATION_AGENT_KINDS)[number]

/** Provider/model overrides for codebase exploration agents. */
export type ExplorationProviderOverrides = Partial<
  Record<ExplorationAgentKind, CustomProviderRuntimeConfig>
>

export const CONTEXT_COMPACTION_RATIO = 0.9

/** Returns the automatic compaction threshold for a model context window. */
export function getContextCompactionThreshold(
  maxContextTokens: number,
): number {
  return Math.max(1, Math.floor(maxContextTokens * CONTEXT_COMPACTION_RATIO))
}
