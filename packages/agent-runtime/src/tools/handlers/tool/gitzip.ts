import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleGitzip = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'gitzip'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'gitzip'>,
  ) => Promise<CodebuffToolOutput<'gitzip'>>
}): Promise<{ output: CodebuffToolOutput<'gitzip'> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params
  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'gitzip'>
