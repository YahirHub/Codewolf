import { z } from 'zod/v4'

import type { ZodType } from 'zod/v4'

const openAICompatibleNestedErrorSchema = z
  .object({
    message: z.string().nullish(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough()

/**
 * OpenAI-compatible gateways do not agree on one error envelope. Accept the
 * most common shapes instead of turning a useful provider error into a schema
 * validation failure:
 *
 * - { error: { message, type, code } }
 * - { error: "message" }
 * - { message: "message" }
 * - { detail: "message" | [{ msg: "message" }] }
 */
export const openaiCompatibleErrorDataSchema = z
  .object({
    error: z.union([openAICompatibleNestedErrorSchema, z.string()]).nullish(),
    message: z.string().nullish(),
    detail: z.unknown().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
    type: z.string().nullish(),
  })
  .passthrough()

export type OpenAICompatibleErrorData = z.infer<
  typeof openaiCompatibleErrorDataSchema
>

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>
  errorToMessage: (error: T) => string
  isRetryable?: (response: Response, error?: T) => boolean
}

const RETRYABLE_HTTP_STATUS_CODES = new Set([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
  500,
  502,
  503,
  504,
])

const TRANSIENT_PROVIDER_MESSAGE_PATTERNS = [
  'upstream request failed',
  'upstream error',
  'temporarily unavailable',
  'temporary unavailable',
  'service unavailable',
  'server overloaded',
  'provider overloaded',
  'model overloaded',
  'over capacity',
  'capacity exceeded',
  'gateway timeout',
  'bad gateway',
  'connection reset',
  'connection closed',
  'request timeout',
  'timed out',
  'try again later',
]

function stringifyDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (!Array.isArray(detail)) return undefined

  const messages = detail
    .flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const message =
        typeof record.msg === 'string'
          ? record.msg
          : typeof record.message === 'string'
            ? record.message
            : undefined
      return message ? [message] : []
    })
    .filter(Boolean)

  return messages.length > 0 ? messages.join('; ') : undefined
}

export function getOpenAICompatibleErrorMessage(
  data: OpenAICompatibleErrorData | undefined,
): string {
  if (!data) return 'Provider request failed'

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }
  if (
    data.error &&
    typeof data.error === 'object' &&
    typeof data.error.message === 'string' &&
    data.error.message.trim()
  ) {
    return data.error.message.trim()
  }
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  return stringifyDetail(data.detail) ?? 'Provider request failed'
}

export function isRetryableOpenAICompatibleError(
  response: Response,
  data?: OpenAICompatibleErrorData,
): boolean {
  const explicitRetry = response.headers.get('x-should-retry')?.trim()
  if (explicitRetry === 'false') return false
  if (explicitRetry === 'true') return true

  if (
    RETRYABLE_HTTP_STATUS_CODES.has(response.status) ||
    response.status >= 500
  ) {
    return true
  }

  const message = getOpenAICompatibleErrorMessage(data).toLowerCase()
  return TRANSIENT_PROVIDER_MESSAGE_PATTERNS.some((pattern) =>
    message.includes(pattern),
  )
}

export const defaultOpenAICompatibleErrorStructure: ProviderErrorStructure<OpenAICompatibleErrorData> =
  {
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: getOpenAICompatibleErrorMessage,
    isRetryable: isRetryableOpenAICompatibleError,
  }
