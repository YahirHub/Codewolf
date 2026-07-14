import {
  countTokens,
  countTokensJson,
  countTokensMessages,
} from '@codebuff/agent-runtime/util/token-counter'
import { normalizeProviderRequestBodyForCacheDebug } from '@codebuff/common/util/cache-debug'

import type { CustomProviderRuntimeConfig } from '@codebuff/common/types/custom-provider'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  TokenUsageEvent,
  TokenUsageMeasurement,
  TokenUsageStatus,
} from '@codebuff/common/types/token-usage'

const MULTIMODAL_TOKEN_ESTIMATE = 1600

type ProviderUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.round(value)
}

function countMultimodalSummaries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => total + countMultimodalSummaries(item),
      0,
    )
  }

  if (!value || typeof value !== 'object') return 0

  const record = value as Record<string, unknown>
  const ownCount = record.type === 'data-url' ? 1 : 0
  return (
    ownCount +
    Object.values(record).reduce<number>(
      (total, item) => total + countMultimodalSummaries(item),
      0,
    )
  )
}

export function estimateRequestTokens(params: {
  messages: Message[]
  provider: string
  rawBody?: unknown
}): { tokens: number; hasMultimodalContent: boolean } {
  if (params.rawBody !== undefined) {
    const normalized = normalizeProviderRequestBodyForCacheDebug({
      provider: params.provider,
      body: params.rawBody,
    })
    const multimodalCount = countMultimodalSummaries(normalized)
    return {
      tokens:
        countTokensJson(normalized) +
        multimodalCount * MULTIMODAL_TOKEN_ESTIMATE,
      hasMultimodalContent: multimodalCount > 0,
    }
  }

  const hasMultimodalContent = params.messages.some((message) => {
    const content = (message as { content?: unknown }).content
    return (
      Array.isArray(content) &&
      content.some((part) => {
        if (!part || typeof part !== 'object') return false
        const type = (part as { type?: unknown }).type
        return type === 'image' || type === 'file' || type === 'media'
      })
    )
  })

  return {
    tokens: countTokensMessages(params.messages),
    hasMultimodalContent,
  }
}

export function estimateOutputTokens(parts: unknown[]): number {
  let total = 0
  for (const part of parts) {
    total +=
      typeof part === 'string' ? countTokens(part) : countTokensJson(part)
  }
  return total
}

export function resolveProviderIdentity(params: {
  requestedModel: string
  provider: string
  customProvider?: CustomProviderRuntimeConfig
}): { providerId: string; providerName: string; modelId: string } {
  if (params.customProvider) {
    return {
      providerId: params.customProvider.id,
      providerName: params.customProvider.name,
      modelId: params.customProvider.modelId,
    }
  }

  return {
    providerId: params.provider,
    providerName: params.provider,
    modelId: params.requestedModel,
  }
}

export function buildTokenUsageEvent(params: {
  timestamp?: string
  sessionId?: string
  projectPath?: string
  runId: string
  userInputId: string
  agentId?: string
  agentType?: string
  providerId: string
  providerName: string
  modelId: string
  providerUsage?: ProviderUsage
  estimatedInputTokens: number
  estimatedOutputTokens: number
  hasMultimodalContent?: boolean
  status: TokenUsageStatus
  durationMs: number
  errorType?: string
}): TokenUsageEvent {
  const reportedInput = toNonNegativeInteger(params.providerUsage?.inputTokens)
  const reportedOutput = toNonNegativeInteger(
    params.providerUsage?.outputTokens,
  )
  const reportedTotal = toNonNegativeInteger(params.providerUsage?.totalTokens)
  const cachedInputTokens =
    toNonNegativeInteger(params.providerUsage?.cachedInputTokens) ?? 0

  const inputTokens = reportedInput ?? Math.max(0, params.estimatedInputTokens)
  const outputTokens =
    reportedOutput ?? Math.max(0, params.estimatedOutputTokens)
  const totalTokens = reportedTotal ?? inputTokens + outputTokens

  let measurement: TokenUsageMeasurement = 'local'
  if (reportedInput !== undefined && reportedOutput !== undefined) {
    measurement = 'provider'
  } else if (
    reportedInput !== undefined ||
    reportedOutput !== undefined ||
    reportedTotal !== undefined
  ) {
    measurement = 'mixed'
  }

  return {
    version: 1,
    timestamp: params.timestamp ?? new Date().toISOString(),
    sessionId: params.sessionId ?? params.runId,
    ...(params.projectPath ? { projectPath: params.projectPath } : {}),
    runId: params.runId,
    userInputId: params.userInputId,
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.agentType ? { agentType: params.agentType } : {}),
    providerId: params.providerId,
    providerName: params.providerName,
    modelId: params.modelId,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    measurement,
    status: params.status,
    durationMs: Math.max(0, Math.round(params.durationMs)),
    ...(params.hasMultimodalContent ? { hasMultimodalContent: true } : {}),
    ...(params.errorType ? { errorType: params.errorType } : {}),
  }
}

export function getSafeErrorType(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80)
  return 'Error'
}
