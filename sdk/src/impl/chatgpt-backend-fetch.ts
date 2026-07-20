/**
 * ChatGPT/Codex transport adapter.
 *
 * Codewolf's internal model adapter speaks Chat Completions while the ChatGPT
 * subscription endpoint speaks the Responses API. This module translates the
 * request/response shapes and, importantly, bounds the startup/idle phases of
 * the SSE transport so a dead Codex connection cannot leave the CLI stuck on
 * "Working..." indefinitely.
 */

import type { FetchFunction } from '@ai-sdk/provider-utils'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const DEFAULT_HEADER_TIMEOUT_MS = 20_000
const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 30_000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 90_000
const DEFAULT_STARTUP_RETRIES = 1
const BASE_RETRY_DELAY_MS = 500

export interface ChatGptBackendFetchOptions {
  /** Stable Codewolf conversation/session identifier used for Codex cache affinity. */
  sessionId?: string
  /** Timeout waiting for HTTP response headers. */
  headerTimeoutMs?: number
  /** Timeout waiting for the first SSE bytes after successful headers. */
  firstEventTimeoutMs?: number
  /** Idle timeout after streaming has started. */
  streamIdleTimeoutMs?: number
  /** Retries for Codex startup stalls and transient 5xx responses. */
  startupRetries?: number
  /** Test seam; production defaults to globalThis.fetch. */
  fetch?: FetchLike
}

class CodexTransportTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodexTransportTimeoutError'
  }
}

// ============================================================================
// JWT / Account ID
// ============================================================================

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad === 2) base64 += '=='
  else if (pad === 3) base64 += '='
  return Buffer.from(base64, 'base64').toString('utf-8')
}

export function extractChatGptAccountId(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(base64UrlDecode(parts[1])) as {
      chatgpt_account_id?: unknown
      organizations?: Array<{ id?: unknown }>
      'https://api.openai.com/auth'?: { chatgpt_account_id?: unknown }
    }
    const nestedAccountId =
      payload['https://api.openai.com/auth']?.chatgpt_account_id
    if (typeof payload.chatgpt_account_id === 'string') {
      return payload.chatgpt_account_id
    }
    if (typeof nestedAccountId === 'string') return nestedAccountId
    const organizationId = payload.organizations?.[0]?.id
    return typeof organizationId === 'string' ? organizationId : null
  } catch {
    return null
  }
}

// ============================================================================
// Request Transform: Chat Completions → Responses API
// ============================================================================

interface ChatCompletionsToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

interface ChatCompletionsMessage {
  role: string
  content?: unknown
  tool_calls?: ChatCompletionsToolCall[]
  tool_call_id?: string
}

interface ChatCompletionsTool {
  type: string
  function?: {
    name: string
    description?: string
    parameters?: unknown
    strict?: boolean
  }
}

function convertUserContentParts(content: unknown): unknown {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  return content.map((part: Record<string, unknown>) => {
    if (part.type === 'text') {
      return { type: 'input_text', text: part.text }
    }
    if (part.type === 'image_url') {
      const imageUrl = part.image_url as Record<string, unknown> | undefined
      return {
        type: 'input_image',
        image_url: imageUrl?.url ?? imageUrl,
      }
    }
    return part
  })
}

function convertMessages(messages: ChatCompletionsMessage[]): unknown[] {
  const input: unknown[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system': {
        if (msg.content) {
          input.push({ type: 'message', role: 'developer', content: msg.content })
        }
        break
      }

      case 'user': {
        const content = convertUserContentParts(msg.content)
        if (content) {
          input.push({ type: 'message', role: 'user', content })
        }
        break
      }

      case 'assistant': {
        if (msg.content) {
          input.push({ type: 'message', role: 'assistant', content: msg.content })
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            input.push({
              type: 'function_call',
              call_id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })
          }
        }
        break
      }

      case 'tool': {
        input.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id ?? 'unknown',
          output:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        })
        break
      }
    }
  }

  return input
}

function convertTools(tools: ChatCompletionsTool[]): unknown[] {
  return tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        ...(tool.function.strict !== undefined && {
          strict: tool.function.strict,
        }),
      }
    }
    return tool
  })
}

function normalizePromptCacheKey(sessionId: string | undefined): string | undefined {
  const value = sessionId?.trim()
  if (!value) return undefined
  return value.length <= 64 ? value : value.slice(0, 64)
}

export function transformChatGptRequestBody(
  body: Record<string, unknown>,
  options: Pick<ChatGptBackendFetchOptions, 'sessionId'> = {},
): Record<string, unknown> {
  const messages = (body.messages ?? []) as ChatCompletionsMessage[]
  const tools = body.tools as ChatCompletionsTool[] | undefined

  const systemMessages = messages.filter((m) => m.role === 'system')
  const nonSystemMessages = messages.filter((m) => m.role !== 'system')
  const instructions = systemMessages
    .map((m) =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    )
    .join('\n\n')

  const transformed: Record<string, unknown> = {
    model: body.model,
    instructions: instructions || 'You are a helpful assistant.',
    input: convertMessages(nonSystemMessages),
    stream: true,
    store: false,
    include: ['reasoning.encrypted_content'],
    tool_choice: 'auto',
    parallel_tool_calls: true,
  }

  const promptCacheKey = normalizePromptCacheKey(options.sessionId)
  if (promptCacheKey) transformed.prompt_cache_key = promptCacheKey

  if (tools?.length) {
    transformed.tools = convertTools(tools)
  }

  const reasoningEffort = body.reasoning_effort as string | undefined
  transformed.reasoning = {
    effort: reasoningEffort || 'high',
    summary: 'auto',
  }

  // Pi's current Codex transport defaults to low verbosity. This keeps coding
  // turns responsive while reasoning/tool output still streams normally.
  transformed.text = { verbosity: 'low' }

  return transformed
}

// ============================================================================
// Transport helpers
// ============================================================================

function getInputSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined)
}

function createTimeoutSignal(params: {
  parent?: AbortSignal
  timeoutMs: number
  message: string
}): {
  signal: AbortSignal
  cleanup: () => void
  timeoutError: () => CodexTransportTimeoutError | undefined
} {
  const controller = new AbortController()
  let timeoutError: CodexTransportTimeoutError | undefined

  const onParentAbort = () => controller.abort(params.parent?.reason)
  params.parent?.addEventListener('abort', onParentAbort, { once: true })

  const timer = setTimeout(() => {
    timeoutError = new CodexTransportTimeoutError(params.message)
    controller.abort(timeoutError)
  }, params.timeoutMs)

  if (params.parent?.aborted) onParentAbort()

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      params.parent?.removeEventListener('abort', onParentAbort)
    },
    timeoutError: () => timeoutError,
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason ?? new Error('Request aborted')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('Request aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  }).finally(() => {
    // Event listeners registered with once:true clean themselves after abort.
  })
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  message: string,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const timeout = createTimeoutSignal({
    parent: signal,
    timeoutMs,
    message,
  })

  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout.signal.addEventListener(
          'abort',
          () => reject(timeout.timeoutError() ?? timeout.signal.reason),
          { once: true },
        )
      }),
    ])
  } finally {
    timeout.cleanup()
  }
}

function streamFromReader(params: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  firstChunk: Uint8Array
  signal?: AbortSignal
  idleTimeoutMs: number
}): ReadableStream<Uint8Array> {
  let sentFirst = false
  let cancelled = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return
      if (!sentFirst) {
        sentFirst = true
        controller.enqueue(params.firstChunk)
        return
      }

      try {
        const result = await readWithTimeout(
          params.reader,
          params.idleTimeoutMs,
          params.signal,
          `La conexión Codex no recibió datos durante ${Math.round(params.idleTimeoutMs / 1000)} segundos.`,
        )
        if (result.done) {
          controller.close()
          return
        }
        if (result.value) controller.enqueue(result.value)
      } catch (error) {
        cancelled = true
        try {
          await params.reader.cancel(error)
        } catch {
          // Ignore cancellation failures after a transport error.
        }
        controller.error(error)
      }
    },
    async cancel(reason) {
      cancelled = true
      try {
        await params.reader.cancel(reason)
      } catch {
        // Best effort.
      }
    },
  })
}

function shouldRetryStartupResponse(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504
}

async function fetchCodexResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: Required<
    Pick<
      ChatGptBackendFetchOptions,
      | 'headerTimeoutMs'
      | 'firstEventTimeoutMs'
      | 'streamIdleTimeoutMs'
      | 'startupRetries'
    >
  > & { fetch: FetchLike },
): Promise<Response> {
  const parentSignal = getInputSignal(input, init)
  const requestTemplate = input instanceof Request ? input.clone() : null
  let lastError: unknown

  for (let attempt = 0; attempt <= options.startupRetries; attempt++) {
    if (parentSignal?.aborted) {
      throw parentSignal.reason ?? new Error('Request aborted')
    }

    const attemptInput = requestTemplate ? requestTemplate.clone() : input
    const headerTimeout = createTimeoutSignal({
      parent: parentSignal,
      timeoutMs: options.headerTimeoutMs,
      message: `Codex no respondió con cabeceras en ${Math.round(options.headerTimeoutMs / 1000)} segundos.`,
    })

    let response: Response
    try {
      response = await options.fetch(attemptInput, {
        ...init,
        signal: headerTimeout.signal,
      })
    } catch (error) {
      const timeoutError = headerTimeout.timeoutError()
      lastError = timeoutError ?? error
      if (timeoutError && attempt < options.startupRetries) {
        await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt, parentSignal)
        continue
      }
      throw lastError
    } finally {
      headerTimeout.cleanup()
    }

    if (!response.ok) {
      if (
        shouldRetryStartupResponse(response.status) &&
        attempt < options.startupRetries
      ) {
        try {
          await response.body?.cancel()
        } catch {
          // Ignore body cancellation before retry.
        }
        await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt, parentSignal)
        continue
      }
      return response
    }

    if (!response.body) return response

    const reader = response.body.getReader()
    try {
      const first = await readWithTimeout(
        reader,
        options.firstEventTimeoutMs,
        parentSignal,
        `Codex abrió la conexión pero no envió ningún evento en ${Math.round(options.firstEventTimeoutMs / 1000)} segundos.`,
      )

      if (first.done || !first.value) {
        lastError = new CodexTransportTimeoutError(
          'Codex cerró la respuesta antes de enviar el primer evento.',
        )
        if (attempt < options.startupRetries) {
          try {
            await reader.cancel(lastError)
          } catch {
            // Ignore.
          }
          await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt, parentSignal)
          continue
        }
        throw lastError
      }

      const headers = new Headers(response.headers)
      return new Response(
        streamFromReader({
          reader,
          firstChunk: first.value,
          signal: parentSignal,
          idleTimeoutMs: options.streamIdleTimeoutMs,
        }),
        {
          status: response.status,
          statusText: response.statusText,
          headers,
        },
      )
    } catch (error) {
      lastError = error
      try {
        await reader.cancel(error)
      } catch {
        // Ignore.
      }
      if (
        error instanceof CodexTransportTimeoutError &&
        attempt < options.startupRetries
      ) {
        await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt, parentSignal)
        continue
      }
      throw error
    }
  }

  throw lastError ?? new Error('Codex transport failed before streaming started')
}

// ============================================================================
// Response Transform: Responses API SSE → Chat Completions SSE
// ============================================================================

function createSseTransformStream(): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ''
  let responseId: string | null = null
  let responseModel: string | null = null
  let nextToolCallIndex = 0
  const outputIndexToToolIndex = new Map<number, number>()
  let emittedRole = false
  let terminalSeen = false

  function emit(
    controller: TransformStreamDefaultController<Uint8Array>,
    chunk: Record<string, unknown>,
  ) {
    if (terminalSeen) return
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
  }

  function finish(
    controller: TransformStreamDefaultController<Uint8Array>,
    resp: Record<string, unknown> | undefined,
  ) {
    if (terminalSeen) return

    const usage = resp?.usage as Record<string, unknown> | undefined
    const status = resp?.status as string | undefined
    let finishReason = 'stop'
    if (status === 'incomplete') finishReason = 'length'
    else if (nextToolCallIndex > 0) finishReason = 'tool_calls'

    const chunk: Record<string, unknown> = {
      id: responseId,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    }

    if (usage) {
      const outputDetails = usage.output_tokens_details as
        | Record<string, unknown>
        | undefined
      chunk.usage = {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        ...(outputDetails?.reasoning_tokens != null && {
          completion_tokens_details: {
            reasoning_tokens: outputDetails.reasoning_tokens,
          },
        }),
      }
    }

    emit(controller, chunk)
    terminalSeen = true
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
  }

  function fail(
    controller: TransformStreamDefaultController<Uint8Array>,
    errorObj: Record<string, unknown> | undefined,
  ) {
    if (terminalSeen) return
    emit(controller, {
      error: {
        message:
          (errorObj?.message as string) ?? 'ChatGPT backend request failed',
        type: (errorObj?.type as string) ?? 'server_error',
        ...(typeof errorObj?.code === 'string' && { code: errorObj.code }),
      },
    })
    terminalSeen = true
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
  }

  function processEvent(
    controller: TransformStreamDefaultController<Uint8Array>,
    data: Record<string, unknown>,
  ) {
    if (terminalSeen) return
    const type = data.type as string | undefined
    if (!type) return

    switch (type) {
      case 'response.created': {
        const resp = data.response as Record<string, unknown> | undefined
        responseId = (resp?.id as string) ?? null
        responseModel = (resp?.model as string) ?? null
        if (!emittedRole) {
          emit(controller, {
            id: responseId,
            model: responseModel,
            choices: [
              { index: 0, delta: { role: 'assistant' }, finish_reason: null },
            ],
          })
          emittedRole = true
        }
        break
      }

      case 'response.output_text.delta': {
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: { content: data.delta as string },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.reasoning_summary_text.delta': {
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: { reasoning_content: data.delta as string },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.output_item.added': {
        const item = data.item as Record<string, unknown> | undefined
        if (item?.type === 'function_call') {
          const tcIndex = nextToolCallIndex++
          const outputIdx = (data.output_index as number) ?? 0
          outputIndexToToolIndex.set(outputIdx, tcIndex)
          emit(controller, {
            id: responseId,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: tcIndex,
                      id: (item.call_id as string) ?? (item.id as string),
                      function: {
                        name: item.name as string,
                        arguments:
                          typeof item.arguments === 'string' ? item.arguments : '',
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })
        }
        break
      }

      case 'response.function_call_arguments.delta': {
        const outputIdx = (data.output_index as number) ?? 0
        const tcIdx = outputIndexToToolIndex.get(outputIdx) ?? 0
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: tcIdx,
                    function: { arguments: data.delta as string },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.completed':
      case 'response.done':
      case 'response.incomplete': {
        const resp = data.response as Record<string, unknown> | undefined
        finish(controller, resp)
        break
      }

      case 'response.failed': {
        const resp = data.response as Record<string, unknown> | undefined
        const errorObj = (resp?.error ?? data.error) as
          | Record<string, unknown>
          | undefined
        fail(controller, errorObj)
        break
      }

      case 'error': {
        const errorObj = (data.error ?? data) as Record<string, unknown>
        fail(controller, errorObj)
        break
      }
    }
  }

  function processBufferedEvents(
    controller: TransformStreamDefaultController<Uint8Array>,
    flush = false,
  ) {
    // Normalize CRLF so event parsing behaves the same on every platform.
    buffer = buffer.replace(/\r\n/g, '\n')

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const eventBlock = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      const dataLines = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
      const jsonStr = dataLines.join('\n').trim()

      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          processEvent(
            controller,
            JSON.parse(jsonStr) as Record<string, unknown>,
          )
        } catch (error) {
          controller.error(
            new Error(
              `Respuesta SSE inválida de Codex: ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
          return
        }
      }

      boundary = buffer.indexOf('\n\n')
    }

    if (flush && buffer.trim()) {
      const dataLines = buffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
      const jsonStr = dataLines.join('\n').trim()
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          processEvent(
            controller,
            JSON.parse(jsonStr) as Record<string, unknown>,
          )
        } catch (error) {
          controller.error(
            new Error(
              `Respuesta SSE inválida de Codex: ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
          return
        }
      }
      buffer = ''
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (terminalSeen) return
      buffer += decoder.decode(chunk, { stream: true })
      processBufferedEvents(controller)
    },

    flush(controller) {
      buffer += decoder.decode()
      processBufferedEvents(controller, true)
      if (!terminalSeen) {
        controller.error(
          new Error(
            'La conexión Codex terminó antes de recibir response.completed.',
          ),
        )
      }
    },
  })
}

function transformResponseStream(
  inputStream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  // pipeThrough propagates upstream and transform errors. The previous
  // pipeTo(...).catch(() => {}) swallowed transport failures and could leave the
  // AI SDK waiting forever for a completion marker.
  return inputStream.pipeThrough(createSseTransformStream())
}

// ============================================================================
// Custom Fetch
// ============================================================================

export function createChatGptBackendFetch(
  options: ChatGptBackendFetchOptions = {},
): FetchFunction {
  const resolvedOptions = {
    sessionId: options.sessionId,
    headerTimeoutMs: options.headerTimeoutMs ?? DEFAULT_HEADER_TIMEOUT_MS,
    firstEventTimeoutMs:
      options.firstEventTimeoutMs ?? DEFAULT_FIRST_EVENT_TIMEOUT_MS,
    streamIdleTimeoutMs:
      options.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    startupRetries: options.startupRetries ?? DEFAULT_STARTUP_RETRIES,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
  }

  const fetchFn: FetchLike = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let transformedInit = init

    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        const transformedBody = transformChatGptRequestBody(body, {
          sessionId: resolvedOptions.sessionId,
        })
        transformedInit = { ...init, body: JSON.stringify(transformedBody) }
      } catch {
        // If body cannot be parsed, let the provider receive the original body.
      }
    }

    let response = await fetchCodexResponse(input, transformedInit, {
      headerTimeoutMs: resolvedOptions.headerTimeoutMs,
      firstEventTimeoutMs: resolvedOptions.firstEventTimeoutMs,
      streamIdleTimeoutMs: resolvedOptions.streamIdleTimeoutMs,
      startupRetries: resolvedOptions.startupRetries,
      fetch: resolvedOptions.fetch,
    })

    if (!response.ok) {
      // Some Codex account usage-limit responses have historically surfaced as
      // 404. Preserve the existing behavior and expose them as rate limits.
      if (response.status === 404) {
        try {
          const text = await response.clone().text()
          if (/usage_limit|rate_limit/i.test(text)) {
            response = new Response(text, {
              status: 429,
              statusText: 'Too Many Requests',
              headers: response.headers,
            })
          }
        } catch {
          // Return the original response if its body cannot be inspected.
        }
      }
      return response
    }

    if (!response.body) return response

    const transformedStream = transformResponseStream(response.body)

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers({
        'content-type': 'text/event-stream; charset=utf-8',
      }),
    })
  }

  return fetchFn as FetchFunction
}
