import { normalizeJsonValue, stringifyJsonValue } from './json'

export type SpawnAgentRequestLike = {
  agent_type?: unknown
  prompt?: unknown
  params?: unknown
}

const normalizePrompt = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

/**
 * Normalize an agent identifier so direct-tool aliases and versioned agent IDs
 * resolve to the same semantic name.
 *
 * Examples:
 * - codebuff/researcher-web@1.0.0 -> researcher-web
 * - researcher_web -> researcher-web
 */
export const normalizeSpawnAgentType = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const segment = raw.split('/').pop() ?? raw
  return segment.split('@')[0].replace(/_/g, '-').toLowerCase()
}

const sortJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonKeys(entry)]),
    )
  }

  return value
}

const stableJson = (value: unknown): string =>
  stringifyJsonValue(sortJsonKeys(normalizeJsonValue(value)))

/**
 * Build a stable semantic key for one spawn request. This is intentionally
 * independent from provider tool-call IDs because some OpenAI-compatible
 * providers repeat the same call with a second generated ID.
 */
export const getSpawnAgentRequestKey = (agent: SpawnAgentRequestLike): string =>
  [
    normalizeSpawnAgentType(agent.agent_type),
    normalizePrompt(agent.prompt),
    stableJson(agent.params ?? null),
  ].join('\u0000')

export const getSpawnAgentSignature = (params: {
  agentType: unknown
  prompt?: unknown
  agentParams?: unknown
}): string =>
  getSpawnAgentRequestKey({
    agent_type: params.agentType,
    prompt: params.prompt,
    params: params.agentParams,
  })

/**
 * Collapse exact duplicate requests while retaining a mapping from each
 * original index to its unique request. The mapping is used by spawn_agents to
 * preserve its result contract without repeating the actual work.
 */
export function deduplicateSpawnAgentRequests<T extends SpawnAgentRequestLike>(
  agents: readonly T[],
): {
  uniqueAgents: T[]
  originalToUniqueIndex: number[]
} {
  const uniqueAgents: T[] = []
  const originalToUniqueIndex: number[] = []
  const keyToUniqueIndex = new Map<string, number>()

  for (const agent of agents) {
    const key = getSpawnAgentRequestKey(agent)
    const existingIndex = keyToUniqueIndex.get(key)
    if (existingIndex !== undefined) {
      originalToUniqueIndex.push(existingIndex)
      continue
    }

    const uniqueIndex = uniqueAgents.length
    keyToUniqueIndex.set(key, uniqueIndex)
    uniqueAgents.push(agent)
    originalToUniqueIndex.push(uniqueIndex)
  }

  return { uniqueAgents, originalToUniqueIndex }
}

/**
 * Tracks semantic spawn requests for one model response. Every semantic request
 * is allowed once, regardless of whether the provider repeats it in the same
 * spawn_agents array, emits it in a later tool call, or calls the agent once
 * directly and once through spawn_agents.
 */
export const createSpawnAgentRequestDeduper = () => {
  const seenRequestKeys = new Set<string>()

  return {
    filterInput(
      input: Record<string, unknown>,
    ): Record<string, unknown> | null {
      const agents = input.agents
      if (!Array.isArray(agents)) {
        return input
      }

      const filteredAgents = agents.filter((agent) => {
        if (agent === null || typeof agent !== 'object') {
          return true
        }

        const key = getSpawnAgentRequestKey(agent as SpawnAgentRequestLike)
        if (seenRequestKeys.has(key)) {
          return false
        }

        seenRequestKeys.add(key)
        return true
      })

      if (filteredAgents.length === 0) {
        return null
      }

      return filteredAgents.length === agents.length
        ? input
        : { ...input, agents: filteredAgents }
    },
    reset() {
      seenRequestKeys.clear()
    },
  }
}
