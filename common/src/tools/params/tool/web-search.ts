import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'web_search'
const endsAgentStep = true
const inputSchema = z
  .object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .describe(`The search query to find relevant web content`),
    depth: z
      .enum(['standard', 'deep'])
      .optional()
      .default('standard')
      .describe(
        `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'.`,
      ),
  })
  .describe(
    `Search the web for current information using the configured provider fallback chain.`,
  )
const description = `
Purpose: Search the web for current, up-to-date information. Codewolf uses the default engine configured in /setup-search and automatically falls back to the next active provider when an engine is unavailable, rate-limited, or returns no usable results.

Use cases:
- Finding current information about technologies, libraries, or frameworks
- Researching best practices and solutions
- Getting up-to-date news or documentation
- Finding examples and tutorials
- Checking current status of services or APIs

The tool returns normalized results with titles, URLs, publication metadata, and snippets, regardless of which search provider completed the request. If no engine is configured, ask the user to open /setup-search.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'Next.js 15 new features',
    depth: 'standard',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'React Server Components tutorial',
    depth: 'deep',
  },
  endsAgentStep,
})}
`.trim()

export const webSearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        result: z.string(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
