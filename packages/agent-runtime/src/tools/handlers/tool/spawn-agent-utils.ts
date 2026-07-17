import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { RESEARCH_AGENT_IDS } from '@codebuff/common/types/custom-provider'
import { toolNames } from '@codebuff/common/tools/constants'
import {
  normalizeAgentIdForLookup,
  parseAgentId,
} from '@codebuff/common/util/agent-id-parsing'
import { generateCompactId } from '@codebuff/common/util/string'

import { loopAgentSteps } from '../../../run-agent-step'
import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValueForError } from '../../../util/format-value'
import {
  filterUnfinishedToolCalls,
  withSystemTags,
} from '../../../util/messages'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  CustomProviderRuntimeConfig,
  ExplorationProviderOverrides,
  ResearchAgentId,
  ResearchProviderOverrides,
} from '@codebuff/common/types/custom-provider'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  OptionalFields,
} from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

/**
 * Common context params needed for spawning subagents.
 * These are the params that don't change between different spawn calls
 * and are passed through from the parent agent runtime.
 */
export type SubagentContextParams = AgentRuntimeDeps &
  AgentRuntimeScopedDeps & {
    clientSessionId: string
    costMode?: string
    extraCodebuffMetadata?: Record<string, string>
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    repoId: string | undefined
    repoUrl: string | undefined
    signal: AbortSignal
    userId: string | undefined
  }

/**
 * Extracts the common context params needed for spawning subagents.
 * This avoids bugs from spreading all params with `...params` which can
 * accidentally pass through params that should be overridden.
 */
export function resolveSubagentProviderContext(params: {
  agentId: string
  apiKey: string
  customProvider?: CustomProviderRuntimeConfig
  sessionProvider?: CustomProviderRuntimeConfig
  opusProvider?: CustomProviderRuntimeConfig
  codeReviewerProvider?: CustomProviderRuntimeConfig
  explorationProviders?: ExplorationProviderOverrides
  researchProviders?: ResearchProviderOverrides
  agentModel?: string
}): {
  apiKey: string
  customProvider?: CustomProviderRuntimeConfig
  usesDedicatedProvider: boolean
} {
  const isResearchAgent = RESEARCH_AGENT_IDS.includes(
    params.agentId as ResearchAgentId,
  )
  const researchProvider = isResearchAgent
    ? params.researchProviders?.[params.agentId as ResearchAgentId]
    : undefined
  const isCodeReviewerAgent =
    params.agentId === 'reviewer' ||
    params.agentId === 'code-reviewer' ||
    params.agentId.startsWith('code-reviewer-')
  const codeReviewerProvider =
    !researchProvider && isCodeReviewerAgent
      ? params.codeReviewerProvider
      : undefined
  const explorationKind =
    params.agentId === 'code-searcher'
      ? 'code-searcher'
      : params.agentId === 'file-picker' ||
          params.agentId.startsWith('file-picker-')
        ? 'file-picker'
        : params.agentId === 'file-lister' ||
            params.agentId.startsWith('file-lister-')
          ? 'file-lister'
          : undefined
  const explorationProvider =
    !researchProvider && !codeReviewerProvider && explorationKind
      ? params.explorationProviders?.[explorationKind]
      : undefined
  const isOpusClassAgent =
    params.agentId.includes('opus') ||
    params.agentModel?.includes('claude-opus') === true
  const opusProvider =
    !researchProvider &&
    !codeReviewerProvider &&
    !explorationKind &&
    isOpusClassAgent
      ? params.opusProvider
      : undefined
  const sessionProvider = params.sessionProvider ?? params.customProvider
  const customProvider =
    researchProvider ??
    codeReviewerProvider ??
    explorationProvider ??
    opusProvider ??
    sessionProvider
  const switchesProviderOrModel = Boolean(
    customProvider &&
      (customProvider.id !== params.customProvider?.id ||
        customProvider.modelId !== params.customProvider?.modelId),
  )
  const usesDedicatedProvider = Boolean(
    researchProvider ??
      codeReviewerProvider ??
      explorationProvider ??
      opusProvider ??
      switchesProviderOrModel,
  )

  return {
    apiKey: customProvider
      ? `local-custom-provider:${customProvider.id}`
      : params.apiKey,
    customProvider,
    usesDedicatedProvider,
  }
}

export function extractSubagentContextParams(
  params: SubagentContextParams,
): SubagentContextParams {
  return {
    // AgentRuntimeDeps - Environment
    clientEnv: params.clientEnv,
    ciEnv: params.ciEnv,
    // AgentRuntimeDeps - Database
    getUserInfoFromApiKey: params.getUserInfoFromApiKey,
    fetchAgentFromDatabase: params.fetchAgentFromDatabase,
    startAgentRun: params.startAgentRun,
    finishAgentRun: params.finishAgentRun,
    addAgentStep: params.addAgentStep,
    // AgentRuntimeDeps - Billing
    consumeCreditsWithFallback: params.consumeCreditsWithFallback,
    // AgentRuntimeDeps - LLM
    promptAiSdkStream: params.promptAiSdkStream,
    promptAiSdk: params.promptAiSdk,
    promptAiSdkStructured: params.promptAiSdkStructured,
    // AgentRuntimeDeps - Mutable State
    databaseAgentCache: params.databaseAgentCache,
    // AgentRuntimeDeps - Analytics
    trackEvent: params.trackEvent,
    // AgentRuntimeDeps - Other
    logger: params.logger,
    traceWriter: params.traceWriter,
    fetch: params.fetch,

    // AgentRuntimeScopedDeps - Client (WebSocket)
    handleStepsLogChunk: params.handleStepsLogChunk,
    requestToolCall: params.requestToolCall,
    requestMcpToolData: params.requestMcpToolData,
    requestFiles: params.requestFiles,
    requestOptionalFile: params.requestOptionalFile,
    sendAction: params.sendAction,
    sendSubagentChunk: params.sendSubagentChunk,
    apiKey: params.apiKey,
    customProvider: params.customProvider,
    sessionProvider: params.sessionProvider,
    opusProvider: params.opusProvider,
    codeReviewerProvider: params.codeReviewerProvider,
    explorationProviders: params.explorationProviders,
    researchProviders: params.researchProviders,
    researchTimeoutMs: params.researchTimeoutMs,

    // Core context params
    clientSessionId: params.clientSessionId,
    costMode: params.costMode,
    extraCodebuffMetadata: params.extraCodebuffMetadata,
    fileContext: params.fileContext,
    localAgentTemplates: params.localAgentTemplates,
    repoId: params.repoId,
    repoUrl: params.repoUrl,
    signal: params.signal,
    userId: params.userId,
  }
}

/**
 * Checks if a parent agent is allowed to spawn a child agent
 */
export function getMatchingSpawn(
  spawnableAgents: AgentTemplateType[],
  childFullAgentId: string,
) {
  const {
    publisherId: childPublisherId,
    agentId: childAgentId,
    version: childVersion,
  } = parseAgentId(normalizeAgentIdForLookup(childFullAgentId))

  if (!childAgentId) {
    return null
  }

  for (const spawnableAgent of spawnableAgents) {
    const {
      publisherId: spawnablePublisherId,
      agentId: spawnableAgentId,
      version: spawnableVersion,
    } = parseAgentId(normalizeAgentIdForLookup(spawnableAgent))

    if (!spawnableAgentId) {
      continue
    }

    if (
      spawnableAgentId === childAgentId &&
      spawnablePublisherId === childPublisherId &&
      spawnableVersion === childVersion
    ) {
      return spawnableAgent
    }
    if (!childVersion && childPublisherId) {
      if (
        spawnablePublisherId === childPublisherId &&
        spawnableAgentId === childAgentId
      ) {
        return spawnableAgent
      }
    }
    if (!childPublisherId && childVersion) {
      if (
        spawnableAgentId === childAgentId &&
        spawnableVersion === childVersion
      ) {
        return spawnableAgent
      }
    }

    if (!childVersion && !childPublisherId) {
      if (spawnableAgentId === childAgentId) {
        return spawnableAgent
      }
    }
  }
  return null
}

/**
 * Validates agent template and permissions
 */
export async function validateAndGetAgentTemplate(
  params: {
    agentTypeStr: string
    parentAgentTemplate: AgentTemplate
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<typeof getAgentTemplate, 'agentId'>,
): Promise<{ agentTemplate: AgentTemplate; agentType: string }> {
  const { agentTypeStr, parentAgentTemplate } = params
  const BASE_AGENTS = ['base', 'base-free', 'base-max', 'base-experimental']
  const isBaseAgent = BASE_AGENTS.includes(parentAgentTemplate.id)
  const agentType = isBaseAgent
    ? normalizeAgentIdForLookup(agentTypeStr)
    : getMatchingSpawn(parentAgentTemplate.spawnableAgents, agentTypeStr)

  if (!agentType) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(
        `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
      )
    }
    throw new Error(
      `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentTypeStr}.`,
    )
  }

  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })

  if (!agentTemplate) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(
        `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
      )
    }
    throw new Error(`Agent type ${agentTypeStr} not found.`)
  }

  return { agentTemplate, agentType }
}

/**
 * Validates prompt and params against agent schema
 */
export function validateAgentInput(
  agentTemplate: AgentTemplate,
  agentType: string,
  prompt?: string,
  params?: any,
): void {
  const { inputSchema } = agentTemplate

  // Validate prompt requirement
  if (inputSchema.prompt) {
    const result = inputSchema.prompt.safeParse(prompt ?? '')
    if (!result.success) {
      throw new Error(
        `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}\n\nOriginal prompt value:\n${formatValueForError(prompt ?? '')}`,
      )
    }
  }

  // Validate params if schema exists
  if (inputSchema.params) {
    const result = inputSchema.params.safeParse(params ?? {})
    if (!result.success) {
      throw new Error(
        `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}\n\nOriginal params value:\n${formatValueForError(params ?? {})}`,
      )
    }
  }
}

/**
 * Creates a new agent state for spawned agents
 */
export function createAgentState(
  agentType: string,
  agentTemplate: AgentTemplate,
  parentAgentState: AgentState,
  agentContext: Record<string, Subgoal>,
): AgentState {
  const agentId = generateCompactId()

  // When including message history, filter out any tool calls that don't have
  // corresponding tool responses. This prevents the spawned agent from seeing
  // unfinished tool calls which throw errors in the Anthropic API.
  let messageHistory: Message[] = []

  if (agentTemplate.includeMessageHistory) {
    messageHistory = filterUnfinishedToolCalls(parentAgentState.messageHistory)
    messageHistory.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: withSystemTags(`Subagent ${agentType} has been spawned.`),
        },
      ],
      tags: ['SUBAGENT_SPAWN'],
    })
  }

  return {
    agentId,
    agentType,
    agentContext,
    ancestorRunIds: [
      ...parentAgentState.ancestorRunIds,
      parentAgentState.runId ?? 'NULL',
    ],
    subagents: [],
    childRunIds: [],
    messageHistory,
    stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: parentAgentState.agentId,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: parentAgentState.contextTokenCount,
  }
}

/**
 * Logs agent spawn information
 */
export function logAgentSpawn(params: {
  agentTemplate: AgentTemplate
  agentType: string
  agentId: string
  parentId: string | undefined
  prompt?: string
  spawnParams?: any
  inline?: boolean
  logger: Logger
}): void {
  const {
    agentTemplate,
    agentType,
    agentId,
    parentId,
    prompt,
    spawnParams,
    inline = false,
    logger,
  } = params
  logger.debug(
    {
      agentTemplate,
      prompt,
      params: spawnParams,
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

const DEFAULT_RESEARCH_TIMEOUT_MS = 15 * 60_000
const MIN_RESEARCH_TIMEOUT_MS = 60_000
const MAX_RESEARCH_TIMEOUT_MS = 120 * 60_000
const DEFAULT_SUBAGENT_TIMEOUT_MS = 10 * 60_000

const RESEARCH_TIMEOUT_AGENT_IDS = new Set<string>(RESEARCH_AGENT_IDS)

export class SubagentTimeoutError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly timeoutMs: number,
  ) {
    const minutes = timeoutMs / 60_000
    const duration = Number.isInteger(minutes)
      ? `${minutes} minute${minutes === 1 ? '' : 's'}`
      : `${Math.round(timeoutMs / 1000)} seconds`
    super(
      `Subagent ${agentType} exceeded the configured ${duration} execution limit.`,
    )
    this.name = 'SubagentTimeoutError'
  }
}

export function getSubagentTimeoutMs(
  agentTemplate: AgentTemplate,
  configuredResearchTimeoutMs?: number,
): number {
  if (!RESEARCH_TIMEOUT_AGENT_IDS.has(agentTemplate.id)) {
    return DEFAULT_SUBAGENT_TIMEOUT_MS
  }

  if (!Number.isFinite(configuredResearchTimeoutMs)) {
    return DEFAULT_RESEARCH_TIMEOUT_MS
  }
  return Math.max(
    MIN_RESEARCH_TIMEOUT_MS,
    Math.min(
      MAX_RESEARCH_TIMEOUT_MS,
      Math.round(configuredResearchTimeoutMs as number),
    ),
  )
}

/**
 * Executes a subagent using loopAgentSteps.
 *
 * Every subagent gets an isolated abort signal and a bounded execution time.
 * This prevents one provider stream that never closes from blocking the parent
 * `spawn_agents` call forever. The finish event is emitted from `finally`, so
 * the CLI never leaves a stale "running" card after errors or timeouts.
 */
export async function executeSubagent(
  options: OptionalFields<
    {
      agentTemplate: AgentTemplate
      parentAgentState: AgentState
      parentTools?: ToolSet
      onResponseChunk: (chunk: string | PrintModeEvent) => void
      isOnlyChild?: boolean
      ancestorRunIds: string[]
    } & ParamsExcluding<typeof loopAgentSteps, 'agentType' | 'ancestorRunIds'>,
    'isOnlyChild' | 'clearUserPromptMessagesAfterResponse'
  >,
) {
  const withDefaults = {
    isOnlyChild: false,
    clearUserPromptMessagesAfterResponse: true,
    ...options,
  }
  const {
    onResponseChunk,
    agentTemplate,
    parentAgentState,
    isOnlyChild,
    ancestorRunIds,
    prompt,
    spawnParams,
  } = withDefaults

  const providerContext = resolveSubagentProviderContext({
    agentId: agentTemplate.id,
    apiKey: withDefaults.apiKey,
    customProvider: withDefaults.customProvider,
    sessionProvider: withDefaults.sessionProvider,
    opusProvider: withDefaults.opusProvider,
    codeReviewerProvider: withDefaults.codeReviewerProvider,
    explorationProviders: withDefaults.explorationProviders,
    researchProviders: withDefaults.researchProviders,
    agentModel: agentTemplate.model,
  })
  const selectedModelId =
    providerContext.customProvider?.modelId ?? agentTemplate.model

  const startEvent = {
    type: 'subagent_start' as const,
    agentId: withDefaults.agentState.agentId,
    agentType: agentTemplate.id,
    displayName: agentTemplate.displayName,
    modelId: selectedModelId,
    onlyChild: isOnlyChild,
    parentAgentId: parentAgentState.agentId,
    prompt,
    params: spawnParams,
  }
  onResponseChunk(startEvent)

  const childAbortController = new AbortController()
  const parentSignal = withDefaults.signal
  const abortFromParent = () =>
    childAbortController.abort(
      parentSignal.reason ?? new DOMException('Aborted', 'AbortError'),
    )

  if (parentSignal.aborted) {
    abortFromParent()
  } else {
    parentSignal.addEventListener('abort', abortFromParent, { once: true })
  }

  const timeoutMs = getSubagentTimeoutMs(
    agentTemplate,
    withDefaults.researchTimeoutMs,
  )
  let acceptLateChunks = true
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      acceptLateChunks = false
      const timeoutError = new SubagentTimeoutError(agentTemplate.id, timeoutMs)
      childAbortController.abort(timeoutError)
      reject(timeoutError)
    }, timeoutMs)
  })

  try {
    const {
      apiKey: childApiKey,
      customProvider: childCustomProvider,
      usesDedicatedProvider,
    } = providerContext

    const runPromise = loopAgentSteps({
      ...withDefaults,
      ...(usesDedicatedProvider
        ? {
            getUserInfoFromApiKey: async ({ fields }) =>
              Object.fromEntries(
                fields.map((field) => [
                  field,
                  field === 'id'
                    ? `local-provider:${childCustomProvider!.id}`
                    : null,
                ]),
              ) as any,
            fetchAgentFromDatabase: async () => null,
            startAgentRun: async () => crypto.randomUUID(),
            finishAgentRun: async () => undefined,
            addAgentStep: async () => crypto.randomUUID(),
          }
        : {}),
      apiKey: childApiKey,
      customProvider: childCustomProvider,
      signal: childAbortController.signal,
      onResponseChunk: (chunk) => {
        if (acceptLateChunks) {
          onResponseChunk(chunk)
        }
      },
      // Don't propagate parent's image content to subagents.
      // If subagents need to see images, they get them through includeMessageHistory,
      // not by creating new image-containing messages for their prompts.
      content: undefined,
      ancestorRunIds: [...ancestorRunIds, parentAgentState.runId ?? ''],
      agentType: agentTemplate.id,
    })

    const result = await Promise.race([runPromise, timeoutPromise])

    if (result.agentState.runId) {
      parentAgentState.childRunIds.push(result.agentState.runId)
    }

    return result
  } finally {
    acceptLateChunks = false
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
    parentSignal.removeEventListener('abort', abortFromParent)

    onResponseChunk({
      type: 'subagent_finish',
      agentId: withDefaults.agentState.agentId,
      agentType: agentTemplate.id,
      displayName: agentTemplate.displayName,
      modelId: selectedModelId,
      onlyChild: isOnlyChild,
      parentAgentId: parentAgentState.agentId,
      prompt,
      params: spawnParams,
    })
  }
}
