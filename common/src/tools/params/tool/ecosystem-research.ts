import z from 'zod/v4'

import {
  ECOSYSTEM_IDS,
  ECOSYSTEM_OPERATIONS,
} from '../../../ecosystem-research/lookup'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'ecosystem_research'
const endsAgentStep = true
const inputSchema = z
  .object({
    ecosystem: z.enum(ECOSYSTEM_IDS).describe('Package ecosystem to inspect.'),
    operation: z
      .enum(ECOSYSTEM_OPERATIONS)
      .describe(
        'Structured operation: search, package metadata, documentation excerpt, symbols, versions, or vulnerabilities.',
      ),
    query: z.string().min(1).optional().describe('Search query.'),
    package: z
      .string()
      .min(1)
      .optional()
      .describe('Exact npm/PyPI project name or Go package import path.'),
    module: z
      .string()
      .min(1)
      .optional()
      .describe('Go module path when it differs from the package path.'),
    version: z
      .string()
      .min(1)
      .optional()
      .describe('Exact version, latest tag, or supported branch name.'),
    topic: z
      .string()
      .min(1)
      .optional()
      .describe('API, symbol, or documentation topic to focus on.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum compact results. Defaults to 5 and never exceeds 10.'),
    refresh: z
      .boolean()
      .optional()
      .default(false)
      .describe('Bypass the local research cache.'),
  })
  .describe(
    'Query official npm Registry, PyPI JSON, or pkg.go.dev APIs with compact, cached output.',
  )

const description = `
Internal ecosystem research tool. It queries official structured npm, PyPI, and Go package services and returns compact metadata instead of full web pages.

Use this tool inside the ecosystem-researcher agent to:
- Resolve published and stable npm, PyPI, or Go package versions.
- Find an exact package from a short search query.
- Inspect runtime requirements, repository links, dependency counts, install lifecycle scripts, and deprecation metadata.
- Read a focused npm README, PyPI project description, or pkg.go.dev documentation excerpt.
- Query Go symbols, versions, and vulnerability data.

Do not dump complete READMEs or large documentation pages. Use web_search/read_url only after this tool identifies the official package, repository, or documentation URL.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    ecosystem: 'npm',
    operation: 'package',
    package: '@whiskeysockets/baileys',
    version: 'latest',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    ecosystem: 'pypi',
    operation: 'package',
    package: 'python-telegram-bot',
    version: 'latest',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    ecosystem: 'go',
    operation: 'symbols',
    package: 'github.com/go-chi/chi/v5',
    topic: 'Router',
    limit: 5,
  },
  endsAgentStep,
})}
`.trim()

export const ecosystemResearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({ result: z.string() }),
      z.object({ errorMessage: z.string() }),
    ]),
  ),
} satisfies $ToolParams
