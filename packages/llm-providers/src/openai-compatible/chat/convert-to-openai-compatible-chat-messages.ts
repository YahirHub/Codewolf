import { UnsupportedFunctionalityError } from '@ai-sdk/provider'
import { convertToBase64 } from '@ai-sdk/provider-utils'
import { stringifyJsonValue } from '@codebuff/common/util/json'

import type { OpenAICompatibleChatPrompt } from './openai-compatible-api-types'
import type {
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider'

function getOpenAIMetadata(message: {
  providerOptions?: SharedV2ProviderMetadata
}) {
  return message?.providerOptions?.openaiCompatible ?? {}
}

function withoutReservedMetadata<T extends object>(
  metadata: T,
  reservedKeys: readonly string[],
): T {
  const sanitized = { ...metadata }
  for (const key of reservedKeys) {
    delete (sanitized as Record<string, unknown>)[key]
  }
  return sanitized
}

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV2Prompt,
  options: { requireNonEmptyAssistantContent?: boolean } = {},
): OpenAICompatibleChatPrompt {
  const messages: OpenAICompatibleChatPrompt = []
  for (const { role, content, ...message } of prompt) {
    const metadata = withoutReservedMetadata(
      getOpenAIMetadata({ ...message }),
      role === 'assistant'
        ? ['role', 'content', 'reasoning_content', 'tool_calls']
        : ['role', 'content'],
    )
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content, ...metadata })
        break
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map((part) => {
            const partMetadata = getOpenAIMetadata(part)
            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                  ...withoutReservedMetadata(partMetadata, ['type', 'text']),
                }
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType

                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                    ...withoutReservedMetadata(partMetadata, [
                      'type',
                      'image_url',
                    ]),
                  }
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  })
                }
              }
            }
          }),
          ...metadata,
        })

        break
      }

      case 'assistant': {
        let text = ''
        let reasoningContent = ''
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }> = []

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part)
          switch (part.type) {
            case 'text': {
              text += part.text
              break
            }
            case 'reasoning': {
              reasoningContent += part.text
              break
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: stringifyJsonValue(part.input),
                },
                ...withoutReservedMetadata(partMetadata, [
                  'id',
                  'type',
                  'function',
                ]),
              })
              break
            }
          }
        }

        // Emit one wire message per run of assistant messages. Thinking models
        // that validate tool-call replay (e.g. DeepSeek V4) require the step's
        // reasoning_content to sit ON the message carrying tool_calls — a
        // separate adjacent assistant message fails the request — so merge
        // instead of pushing a second assistant message.
        const previous = messages[messages.length - 1]
        if (previous?.role === 'assistant') {
          if (text.length > 0) {
            previous.content =
              typeof previous.content === 'string'
                ? previous.content + text
                : text
          }
          if (reasoningContent.length > 0) {
            previous.reasoning_content =
              typeof previous.reasoning_content === 'string'
                ? previous.reasoning_content + reasoningContent
                : reasoningContent
          }
          if (toolCalls.length > 0) {
            previous.tool_calls = [...(previous.tool_calls ?? []), ...toolCalls]
          }
          // Metadata unions with later-wins precedence — the same key
          // precedence the push path gets from spreading metadata last.
          Object.assign(previous, metadata)
          break
        }

        messages.push({
          role: 'assistant',
          content: text,
          reasoning_content:
            reasoningContent.length > 0 ? reasoningContent : undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        })

        break
      }

      case 'tool': {
        for (const toolResponse of content) {
          const output = toolResponse.output

          let contentValue: string
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value
              break
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = stringifyJsonValue(output.value)
              break
          }

          const toolResponseMetadata = getOpenAIMetadata(toolResponse)
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
            ...withoutReservedMetadata(toolResponseMetadata, [
              'role',
              'tool_call_id',
              'content',
            ]),
          })
        }
        break
      }

      default: {
        const _exhaustiveCheck: never = role
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`)
      }
    }
  }

  if (options.requireNonEmptyAssistantContent) {
    // Some OpenAI-compatible gateways (notably CommandCode-style proxies)
    // normalize an empty assistant `content` string to `null` before their
    // final schema validation. Their validator then rejects replayed tool-call
    // or reasoning-only assistant messages even though the original OpenAI
    // protocol permits a nullable/empty content field in those cases.
    //
    // A single whitespace character is semantically inert for the model while
    // remaining a real string through proxies that coerce other falsy values.
    // Apply this only when explicitly requested by the provider adapter.
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        (message.content == null || message.content.length === 0)
      ) {
        message.content = ' '
      }
    }
  }

  return messages
}
