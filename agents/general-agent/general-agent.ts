import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

export const createGeneralAgent = (options: {
  variant: 'default' | 'opus'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { variant } = options
  const isDefaultAgent = variant === 'default'

  return {
    publisher,
    model: isDefaultAgent ? 'openai/gpt-5.4' : 'anthropic/claude-opus-4.8',
    ...(!isDefaultAgent && {
      providerOptions: {
        only: ['amazon-bedrock'],
      },
    }),
    ...(isDefaultAgent && {
      reasoningOptions: {
        effort: 'high' as const,
      },
    }),
    displayName: isDefaultAgent ? 'Agent' : 'Opus Agent',
    spawnerPrompt: isDefaultAgent
      ? 'A general-purpose, deep-thinking (and slow) agent that can be used to solve a wide range of problems. Use this to help you solve a specific problem that requires extended reasoning. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.'
      : 'A general-purpose capable agent that can be used to solve a wide range of problems. Use this to help you solve any problem. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'The problem you are trying to solve',
      },
      params: {
        type: 'object',
        properties: {
          filePaths: {
            type: 'array',
            items: {
              type: 'string',
              description: 'The path to a file',
            },
            description:
              'A list of relevant file paths to read before thinking. Try to provide ALL the files that could be relevant to your request.',
          },
        },
      },
    },
    outputMode: 'last_message',
    spawnableAgents: buildArray(
      'researcher-web',
      'researcher-docs',
      'ecosystem-researcher',
      !isDefaultAgent && 'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'basher',
      'context-pruner',
    ),
    toolNames: [
      'spawn_agents',
      'read_files',
      'read_subtree',
      'str_replace',
      'write_file',
    ],

    instructionsPrompt: buildArray(
      `Use the spawn_agents tool to spawn agents to help you complete the user request.`,
      !isDefaultAgent &&
        `If you need to find more information in the codebase, file-picker is really good at finding relevant files. Spawn multiple independent agents in parallel when possible. Exception: for an external Node/Bun/npm, Python/PyPI, or Go package, spawn ecosystem-researcher first and wait for its compact brief; do not launch researcher-web or researcher-docs for the same package in parallel. Use one focused fallback researcher only if ecosystem-researcher fails or reports a concrete unresolved gap.`,
    ).join('\n'),

    handleSteps: function* ({ params }) {
      const filePaths = params?.filePaths as string[] | undefined

      if (filePaths && filePaths.length > 0) {
        yield {
          toolName: 'read_files',
          input: { paths: filePaths },
        }
      }

      while (true) {
        // Run context-pruner before each step
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: params ?? {},
          },
          includeToolCall: false,
        } as any

        const { stepsComplete } = yield 'STEP'
        if (stepsComplete) break
      }
    },
  }
}
