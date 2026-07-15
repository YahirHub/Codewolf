import { describe, test, expect } from 'bun:test'

import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import commander from '../basher'

import type { AgentState } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

describe('commander agent', () => {
  const createMockAgentState = (): AgentState => ({
    agentId: 'commander-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(commander.id).toBe('basher')
    })

    test('has display name', () => {
      expect(commander.displayName).toBe('Basher')
    })

    test('uses flash-lite model', () => {
      expect(commander.model).toBe(GEMINI_3_1_FLASH_LITE_MODEL_ID)
    })

    test('has output mode set to last_message', () => {
      expect(commander.outputMode).toBe('last_message')
    })

    test('does not include message history', () => {
      expect(commander.includeMessageHistory).toBe(false)
    })

    test('has run_terminal_command tool', () => {
      expect(commander.toolNames).toContain('run_terminal_command')
      expect(commander.toolNames).toHaveLength(1)
    })
  })

  describe('input schema', () => {
    test('requires command parameter', () => {
      const schema = commander.inputSchema
      const commandProp = schema?.params?.properties?.command
      expect(
        commandProp &&
          typeof commandProp === 'object' &&
          'type' in commandProp &&
          commandProp.type,
      ).toBe('string')
      expect(schema?.params?.required).toContain('command')
    })

    test('has optional timeout_seconds parameter', () => {
      const schema = commander.inputSchema
      const timeoutProp = schema?.params?.properties?.timeout_seconds
      expect(
        timeoutProp &&
          typeof timeoutProp === 'object' &&
          'type' in timeoutProp &&
          timeoutProp.type,
      ).toBe('number')
      expect(schema?.params?.required).not.toContain('timeout_seconds')
    })

    test('has optional what_to_summarize parameter', () => {
      const schema = commander.inputSchema
      const summarizeProp = schema?.params?.properties?.what_to_summarize
      expect(
        summarizeProp &&
          typeof summarizeProp === 'object' &&
          'type' in summarizeProp &&
          summarizeProp.type,
      ).toBe('string')
      expect(schema?.params?.required).not.toContain('what_to_summarize')
    })
  })

  describe('handleSteps', () => {
    test('returns error when no command provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toContain('Error')
      expect(toolCall.input.output).toContain('command')
    })

    test('yields run_terminal_command with basic command', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la' },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'ls -la',
        },
      })
    })

    test('yields run_terminal_command with timeout', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'sleep 10', timeout_seconds: 60 },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'sleep 10',
          timeout_seconds: 60,
        },
      })
    })

    test('yields set_output with raw result when what_to_summarize is not provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo hello' },
      })

      // First yield is the command
      generator.next()

      // Second yield should be set_output with the result
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: { stdout: 'hello' } }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: { stdout: string } }
        includeToolCall?: boolean
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toEqual({ stdout: 'hello' })
      expect(toolCall.includeToolCall).toBe(false)
      expect(result.done).toBe(false)

      // Next should be done
      const final = generator.next()
      expect(final.done).toBe(true)
    })

    test('returns raw output without a second model step when a summary focus is provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la', what_to_summarize: 'list of files' },
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          { type: 'json' as const, value: { stdout: 'file1.txt\nfile2.txt' } },
        ],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      expect(result.value).toEqual({
        toolName: 'set_output',
        input: {
          output: {
            stdout: 'file1.txt\nfile2.txt',
            requestedSummary: 'list of files',
          },
        },
        includeToolCall: false,
      })
      expect(result.value).not.toBe('STEP')
    })

    test('handles empty tool result gracefully', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test' },
      })

      // First yield is the command
      generator.next()

      // Second yield with empty result
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [] as ToolResultOutput[],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { output: unknown }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toEqual({
        command: 'echo test',
        output: 'No terminal result was returned.',
      })
    })

    test('handles non-json tool result', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test' },
      })

      // First yield is the command
      generator.next()

      // Second yield with non-json result
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: 'plain text output' }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: unknown }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toEqual({
        command: 'echo test',
        output: 'plain text output',
      })
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = commander.handleSteps!.toString()

      // Verify it's a valid generator function string
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      // Should be able to create a new function from it
      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })
  })

  describe('system prompt', () => {
    test('requires exact structured terminal output', () => {
      expect(commander.systemPrompt).toContain('structured terminal result')
      expect(commander.systemPrompt).toContain('Do not reinterpret')
    })
  })

  describe('instructions prompt', () => {
    test('mentions the active project and reported shell metadata', () => {
      expect(commander.instructionsPrompt).toContain('active project')
      expect(commander.instructionsPrompt).toContain('shell')
      expect(commander.instructionsPrompt).toContain('startingCwd')
    })
  })
})
