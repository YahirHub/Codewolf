import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleSshRemote = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'ssh_remote'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'ssh_remote'>,
  ) => Promise<CodebuffToolOutput<'ssh_remote'>>
}): Promise<{ output: CodebuffToolOutput<'ssh_remote'> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params
  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'ssh_remote'>
