import type { RunState } from '@codebuff/sdk'

export type ContextWindowLevel = 'normal' | 'warning' | 'critical'

export interface ContextWindowProgress {
  usedTokens: number
  maxTokens: number
  usedFraction: number
  remainingFraction: number
  usedPercent: number
  remainingPercent: number
  level: ContextWindowLevel
}

const WARNING_THRESHOLD = 0.75
const CRITICAL_THRESHOLD = 0.9

const normalizeTokenCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.round(value)
}

export function getRunStateContextTokenCount(
  runState: RunState | null | undefined,
): number {
  return normalizeTokenCount(
    runState?.sessionState?.mainAgentState?.contextTokenCount,
  )
}

export function getContextWindowProgress(
  usedTokens: number,
  maxTokens: number,
): ContextWindowProgress | null {
  const normalizedMax = normalizeTokenCount(maxTokens)
  if (normalizedMax === 0) return null

  const normalizedUsed = Math.max(0, Math.round(usedTokens || 0))
  const usedFraction = Math.max(0, Math.min(1, normalizedUsed / normalizedMax))
  const remainingFraction = 1 - usedFraction
  const level: ContextWindowLevel =
    usedFraction >= CRITICAL_THRESHOLD
      ? 'critical'
      : usedFraction >= WARNING_THRESHOLD
        ? 'warning'
        : 'normal'

  return {
    usedTokens: normalizedUsed,
    maxTokens: normalizedMax,
    usedFraction,
    remainingFraction,
    usedPercent: Math.round(usedFraction * 100),
    remainingPercent: Math.round(remainingFraction * 100),
    level,
  }
}

export function formatContextTokens(tokens: number): string {
  const normalized = Math.max(0, Math.round(tokens || 0))

  if (normalized >= 1_000_000) {
    const millions = normalized / 1_000_000
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`
  }

  if (normalized >= 1_000) {
    const thousands = normalized / 1_000
    return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`
  }

  return String(normalized)
}
