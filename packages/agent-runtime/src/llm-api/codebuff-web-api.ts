import { fetchContext7LibraryDocumentation } from './context7-api'

import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { JSONObject } from '@codebuff/common/types/json'
import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Compatibility-only facade for legacy upstream symbols.
 *
 * Codewolf no longer sends runtime requests to Codebuff services. Active web
 * search uses the local multi-provider search runtime, documentation goes
 * directly to Context7, context token accounting is local, and Gravity Index
 * is not exposed by bundled agents.
 */
interface CodebuffWebApiEnv {
  clientEnv: ClientEnv
  ciEnv: CiEnv
}

/**
 * @deprecated Active Codewolf searches use the local multi-provider runtime in
 * `common/src/web-search`. Kept only so downstream imports fail gracefully
 * instead of contacting the historical Codebuff backend.
 */
export async function callWebSearchAPI(_params: {
  query: string
  depth?: 'standard' | 'deep'
  repoUrl?: string | null
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{ result?: string; error?: string; creditsUsed?: number }> {
  return {
    error:
      'El backend heredado de búsqueda de Codebuff está deshabilitado. Usa el runtime local de proveedores de búsqueda de Codewolf.',
  }
}

export async function callDocsSearchAPI(params: {
  libraryTitle: string
  topic?: string
  maxTokens?: number
  repoUrl?: string | null
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{ documentation?: string; error?: string; creditsUsed?: number }> {
  // Compatibility facade: documentation is fetched directly from Context7.
  const documentation = await fetchContext7LibraryDocumentation({
    query: params.libraryTitle,
    topic: params.topic,
    tokens: params.maxTokens,
    logger: params.logger,
    fetch: params.fetch,
  })

  if (!documentation) {
    return {
      error: `No documentation found for "${params.libraryTitle}"${
        params.topic ? ` (topic: ${params.topic})` : ''
      }`,
    }
  }

  return { documentation, creditsUsed: 0 }
}

/**
 * @deprecated Gravity Index depended on the historical Codebuff backend and is
 * intentionally disabled. Bundled Codewolf agents do not expose this tool.
 */
export async function callGravityIndexAPI(_params: {
  input: JSONObject
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{
  result?: JSONObject
  error?: string
  creditsUsed?: number
}> {
  return {
    error:
      'Gravity Index está deshabilitado porque dependía del backend heredado de Codebuff. Usa researcher-web o los proveedores de búsqueda configurados.',
  }
}

/**
 * @deprecated Context token accounting is now always performed locally.
 */
export async function callTokenCountAPI(_params: {
  messages: unknown[]
  system?: string
  model?: string
  tools?: Array<{ name: string; description?: string; input_schema?: unknown }>
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{ inputTokens?: number; error?: string }> {
  return {
    error:
      'El conteo remoto de tokens está deshabilitado; Codewolf usa conteo local de contexto.',
  }
}
