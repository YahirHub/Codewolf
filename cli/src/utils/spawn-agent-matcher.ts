import { getSpawnAgentSignature } from '@codebuff/common/util/spawn-agent'

import { getAgentBaseName, moveSpawnAgentBlock } from './message-block-helpers'

import type { SpawnAgentInfo } from '../hooks/stream-state'
import type { ContentBlock } from '../types/chat'

export interface SpawnAgentMatch {
  tempId: string
  info: SpawnAgentInfo
}

const normalizePrompt = (value: string | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ')

export const findMatchingSpawnAgent = (
  spawnAgentsMap: Map<string, SpawnAgentInfo>,
  eventAgentType: string,
  eventPrompt?: string,
  eventParams?: Record<string, unknown>,
): SpawnAgentMatch | null => {
  const eventBaseName = getAgentBaseName(eventAgentType || '')
  const normalizedEventPrompt = normalizePrompt(eventPrompt)
  const eventSignature = getSpawnAgentSignature({
    agentType: eventAgentType,
    prompt: eventPrompt,
    agentParams: eventParams,
  })
  const typeMatches: SpawnAgentMatch[] = []

  // Prefer the complete semantic signature. This matters when two agents use
  // the same type and prompt but differ in params, and their start events arrive
  // out of order.
  for (const [tempId, info] of spawnAgentsMap.entries()) {
    const storedBaseName = getAgentBaseName(info.agentType || '')
    if (eventBaseName !== storedBaseName) {
      continue
    }

    const match = { tempId, info }
    typeMatches.push(match)
    const storedSignature = getSpawnAgentSignature({
      agentType: info.agentType,
      prompt: info.prompt,
      agentParams: info.params,
    })
    if (storedSignature === eventSignature) {
      return match
    }
  }

  // Older/custom providers may omit params from subagent_start. In that case,
  // fall back to exact prompt matching, then finally to the first type match.
  for (const match of typeMatches) {
    const storedPrompt = normalizePrompt(match.info.prompt)
    if (
      normalizedEventPrompt !== '' &&
      storedPrompt !== '' &&
      normalizedEventPrompt === storedPrompt
    ) {
      return match
    }
  }

  return typeMatches[0] ?? null
}

export const resolveSpawnAgentToReal = (options: {
  blocks: ContentBlock[]
  match: SpawnAgentMatch
  realAgentId: string
  realAgentType?: string
  parentAgentId?: string
  params?: Record<string, unknown>
  prompt?: string
  modelId?: string
}): ContentBlock[] => {
  const {
    blocks,
    match,
    realAgentId,
    realAgentType,
    parentAgentId,
    params: agentParams,
    prompt,
    modelId,
  } = options

  return moveSpawnAgentBlock(
    blocks,
    match.tempId,
    realAgentId,
    parentAgentId,
    agentParams,
    prompt,
    realAgentType,
    modelId,
  )
}
