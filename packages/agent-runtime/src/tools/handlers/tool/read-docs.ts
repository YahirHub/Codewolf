import { jsonToolResult } from '@codebuff/common/util/messages'

import { callDocsSearchAPI } from '../../../llm-api/codebuff-web-api'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

export const handleReadDocs = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'read_docs'>

    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    logger: Logger
    repoId: string | undefined
    userId: string | undefined
    userInputId: string
    clientEnv: ClientEnv
    ciEnv: CiEnv
  } & ParamsExcluding<
    typeof callDocsSearchAPI,
    'libraryTitle' | 'topic' | 'maxTokens' | 'repoUrl' | 'env'
  >,
): Promise<{
  output: CodebuffToolOutput<'read_docs'>
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
    clientEnv,
    ciEnv,
  } = params
  const { libraryTitle, topic, max_tokens } = toolCall.input

  const docsStartTime = Date.now()
  const docsContext = {
    toolCallId: toolCall.toolCallId,
    libraryTitle,
    topic,
    max_tokens,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0
  try {
    const result = await callDocsSearchAPI({
      libraryTitle,
      topic,
      maxTokens: max_tokens,
      repoUrl: undefined,
      logger,
      fetch,
      env: { clientEnv, ciEnv },
    })
    creditsUsed = result.creditsUsed ?? 0

    if (!result.documentation) {
      const docsDuration = Date.now() - docsStartTime
      const docMsg = result.error
        ? `Error fetching documentation for "${libraryTitle}": ${result.error}`
        : `No documentation found for "${libraryTitle}"${topic ? ` (topic: ${topic})` : ''}`
      logger.warn(
        {
          ...docsContext,
          docsDuration,
          provider: 'context7-direct',
          success: false,
        },
        'Context7 documentation request returned no content',
      )
      return {
        output: jsonToolResult({
          documentation: docMsg,
          errorMessage: docMsg,
        }),
        creditsUsed,
      }
    }

    const documentation = result.documentation
    const docsDuration = Date.now() - docsStartTime
    const resultLength = documentation.length
    const estimatedTokens = Math.ceil(resultLength / 4)

    logger.info(
      {
        ...docsContext,
        docsDuration,
        resultLength,
        estimatedTokens,
        hasResults: Boolean(documentation.trim()),
        provider: 'context7',
        creditsUsed,
        success: true,
      },
      'Documentation request completed successfully via Context7',
    )
    return {
      output: jsonToolResult({ documentation }),
      creditsUsed,
    }
  } catch (error) {
    const docsDuration = Date.now() - docsStartTime
    const errMsg = `Error fetching documentation for "${libraryTitle}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...docsContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        docsDuration,
        success: false,
      },
      'Documentation request failed with error',
    )
    return {
      output: jsonToolResult({ documentation: errMsg, errorMessage: errMsg }),
      creditsUsed,
    }
  }
}) satisfies CodebuffToolHandlerFunction<'read_docs'>
