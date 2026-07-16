import { runEcosystemLookup } from '@codebuff/common/ecosystem-research/lookup'
import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleEcosystemResearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'ecosystem_research'>
  fetch: typeof globalThis.fetch
  signal?: AbortSignal
  logger: Logger
}): Promise<{
  output: CodebuffToolOutput<'ecosystem_research'>
  creditsUsed: number
}> => {
  const { previousToolCallFinished, toolCall, fetch, signal, logger } = params

  await previousToolCallFinished

  try {
    const result = await runEcosystemLookup(toolCall.input, { fetch, signal })
    logger.info(
      {
        ecosystem: result.ecosystem,
        operation: result.operation,
        cached: result.cached,
        sourceUrl: result.sourceUrl,
      },
      'Ecosystem research lookup completed',
    )
    return {
      output: jsonToolResult({ result: JSON.stringify(result) }),
      creditsUsed: 0,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown ecosystem research error.'
    logger.warn(
      {
        ecosystem: toolCall.input.ecosystem,
        operation: toolCall.input.operation,
        error: errorMessage,
      },
      'Ecosystem research lookup failed',
    )
    return {
      output: jsonToolResult({ errorMessage }),
      creditsUsed: 0,
    }
  }
}) satisfies CodebuffToolHandlerFunction<'ecosystem_research'>
