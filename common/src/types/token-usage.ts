/** Source used to determine the token count for an LLM request. */
export type TokenUsageMeasurement = 'provider' | 'mixed' | 'local'

/** Final state of the model request represented by a usage event. */
export type TokenUsageStatus = 'success' | 'error' | 'aborted'

/**
 * Numeric metadata for one real model request.
 *
 * This contract intentionally excludes prompts, responses, tool results and
 * credentials. Hosts may persist it without copying conversation content.
 */
export interface TokenUsageEvent {
  version: 1
  timestamp: string
  sessionId: string
  projectPath?: string
  runId: string
  userInputId: string
  agentId?: string
  agentType?: string
  providerId: string
  providerName: string
  modelId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  measurement: TokenUsageMeasurement
  status: TokenUsageStatus
  durationMs: number
  /** True when the local estimate includes one or more images/files. */
  hasMultimodalContent?: boolean
  /** Sanitized technical error category; never contains provider response data. */
  errorType?: string
}

export type TokenUsageCallback = (
  event: TokenUsageEvent,
) => void | Promise<void>
