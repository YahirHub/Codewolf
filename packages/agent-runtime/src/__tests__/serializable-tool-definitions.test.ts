import { describe, expect, test } from 'bun:test'
import { tool } from 'ai'
import { z } from 'zod/v4'

import { serializeToolDefinitions } from '../util/tool-schema'

describe('serializeToolDefinitions', () => {
  test('stores recursive Zod schemas as plain serializable JSON Schema', () => {
    const RecursiveNode: z.ZodType = z.lazy(() =>
      z.object({
        name: z.string(),
        children: z.array(RecursiveNode).optional(),
      }),
    )

    const definitions = serializeToolDefinitions({
      render_tree: tool({
        description: 'Render a recursive tree',
        inputSchema: RecursiveNode,
      }),
    })

    expect(definitions.render_tree?.inputSchema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        children: {
          type: 'array',
          items: { $ref: '#' },
        },
      },
      required: ['name'],
    })
    expect(() => JSON.stringify(definitions)).not.toThrow()
    expect(
      typeof (definitions.render_tree?.inputSchema as { safeParse?: unknown })
        .safeParse,
    ).toBe('undefined')
  })

  test('normalizes circular plain JSON-schema wrappers from integrations', () => {
    const circularSchema: Record<string, unknown> = { type: 'object' }
    circularSchema.self = circularSchema

    const definitions = serializeToolDefinitions({
      legacy_tool: {
        description: 'Legacy integration tool',
        inputSchema: circularSchema,
      } as any,
    })

    expect(definitions.legacy_tool?.inputSchema).toEqual({
      type: 'object',
      self: '[Circular]',
    })
    expect(() => JSON.stringify(definitions)).not.toThrow()
  })
})
