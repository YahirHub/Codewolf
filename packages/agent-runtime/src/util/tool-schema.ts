import { normalizeJsonValue } from '@codebuff/common/util/json'
import { z } from 'zod/v4'

import type { ToolSet } from 'ai'

/**
 * Convert a runtime tool input schema into plain JSON Schema.
 *
 * Tool definitions are persisted in SessionState between turns. Storing the
 * original Zod instances there is unsafe because recursive/lazy schemas can
 * contain circular references. A second turn then fails when the SDK clones
 * the previous session with JSON.stringify().
 */
export function toTokenCountInputSchema(
  inputSchema: unknown,
): Record<string, unknown> | undefined {
  if (inputSchema == null) return undefined

  let jsonSchema: Record<string, unknown>
  if (
    typeof (inputSchema as { safeParse?: unknown }).safeParse === 'function'
  ) {
    try {
      jsonSchema = z.toJSONSchema(inputSchema as z.ZodType, {
        io: 'input',
      }) as Record<string, unknown>
    } catch {
      jsonSchema = { type: 'object', properties: {} }
    }
  } else if (typeof inputSchema === 'object' && !Array.isArray(inputSchema)) {
    jsonSchema = inputSchema as Record<string, unknown>
  } else {
    return undefined
  }

  const normalized = normalizeJsonValue(jsonSchema)
  if (
    normalized === null ||
    typeof normalized !== 'object' ||
    Array.isArray(normalized)
  ) {
    return { type: 'object', properties: {} }
  }
  const plainSchema = normalized as Record<string, unknown>
  delete plainSchema['$schema']
  if (plainSchema.type == null || plainSchema.type === '') {
    plainSchema.type = 'object'
  }
  return plainSchema
}

/**
 * Build the serializable tool-definition snapshot stored in AgentState.
 * Runtime schemas stay in the live ToolSet; SessionState receives JSON only.
 */
export function serializeToolDefinitions(
  tools: ToolSet | undefined,
): Record<
  string,
  { description: string | undefined; inputSchema: Record<string, unknown> }
> {
  if (!tools) return {}

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        description: tool.description,
        inputSchema: toTokenCountInputSchema(tool.inputSchema) ?? {
          type: 'object',
          properties: {},
        },
      },
    ]),
  )
}
