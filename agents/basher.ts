import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const basher: AgentDefinition = {
  id: 'basher',
  publisher,
  model: GEMINI_3_1_FLASH_LITE_MODEL_ID,
  displayName: 'Basher',
  spawnerPrompt:
    'Runs one Bash command in the active project directory and returns its raw structured output without making a second model request. Every basher spawn MUST include params: { command: "<shell>" }. Do not prepend cd to the active project root and do not write Windows paths directly in Bash commands.',

  inputSchema: {
    params: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The terminal command to run with Bash syntax in the active project directory. Do not prepend cd to the current project. On Windows, Git Bash path rules apply.',
        },
        what_to_summarize: {
          type: 'string',
          description:
            'Optional focus for the parent agent. Basher still returns the raw structured command result and does not call another model to summarize it.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Set to -1 for no timeout. Default 30',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt:
    'Execute the requested command and return the exact structured terminal result. Do not reinterpret, retry, or alter the result.',
  instructionsPrompt:
    'Run the command once in the active project directory. Return stdout, stderr, exitCode, startingCwd, shell and any command normalization metadata exactly as reported by the terminal tool.',
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Basher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: { output: 'Error: Missing required "command" parameter' },
      }
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined
    const what_to_summarize = params?.what_to_summarize as string | undefined

    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command,
        ...(timeout_seconds !== undefined && { timeout_seconds }),
      },
    }

    const result = toolResult?.[0]
    const rawOutput =
      result?.type === 'json' &&
      result.value !== null &&
      typeof result.value === 'object'
        ? result.value
        : {
            command,
            output:
              result && 'value' in result
                ? result.value
                : 'No terminal result was returned.',
          }

    const output = what_to_summarize
      ? {
          ...rawOutput,
          requestedSummary: what_to_summarize,
        }
      : rawOutput

    // A second LLM step made a successful command appear to fail whenever a
    // provider had a transient outage. The parent agent already receives this
    // output and can analyze it, so return deterministically here.
    yield {
      toolName: 'set_output',
      input: { output },
      includeToolCall: false,
    }
  },
}

export default basher
