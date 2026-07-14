import {
  loadWebSearchAuth,
  loadWebSearchSettings,
} from '@codebuff/common/web-search/search-storage'
import { runWebSearchWithFallback } from '@codebuff/common/web-search/search-runtime'
import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  repoUrl: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
  signal?: AbortSignal
}): Promise<{
  output: CodebuffToolOutput<'web_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,
    agentStepId,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    userId,
    userInputId,
    fetch,
    signal,
  } = params
  const { query, depth = 'standard' } = toolCall.input

  await previousToolCallFinished

  const searchStartTime = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  try {
    const settings = loadWebSearchSettings()
    const auth = loadWebSearchAuth()
    const result = await runWebSearchWithFallback(
      {
        query,
        numResults: depth === 'deep' ? 15 : 8,
        type: depth === 'deep' ? 'deep' : 'fast',
        livecrawl: depth === 'deep' ? 'preferred' : 'fallback',
      },
      { settings, auth },
      signal,
      fetch,
    )

    logger.info(
      {
        ...searchContext,
        searchDuration: Date.now() - searchStartTime,
        provider: result.provider,
        resultCount: result.resultCount,
        attempts: result.attempts,
        success: true,
      },
      'Search completed with configured provider fallback',
    )

    return {
      output: jsonToolResult({ result: result.text }),
      creditsUsed: 0,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Error de búsqueda desconocido.'

    logger.error(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        searchDuration: Date.now() - searchStartTime,
        success: false,
      },
      'Search failed with every configured provider',
    )

    return {
      output: jsonToolResult({ errorMessage }),
      creditsUsed: 0,
    }
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
