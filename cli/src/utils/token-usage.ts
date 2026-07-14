import fs from 'fs'
import path from 'path'

import { getConfigDir } from './config-dir'

import type {
  TokenUsageEvent,
  TokenUsageMeasurement,
  TokenUsageStatus,
} from '@codebuff/common/types/token-usage'

const MAX_USAGE_EVENTS = 10_000
const USAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const COMPACT_AFTER_BYTES = 4 * 1024 * 1024

export interface TokenUsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  providerMeasured: number
  mixedMeasured: number
  locallyCalculated: number
  successful: number
  failed: number
  aborted: number
  durationMs: number
}

export interface TokenUsageGroup extends TokenUsageTotals {
  key: string
  label: string
}

export function getTokenUsagePath(configDir = getConfigDir()): string {
  return path.join(configDir, 'usage.jsonl')
}

function ensureUsageDir(configDir: string): void {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
}

function isMeasurement(value: unknown): value is TokenUsageMeasurement {
  return value === 'provider' || value === 'mixed' || value === 'local'
}

function isStatus(value: unknown): value is TokenUsageStatus {
  return value === 'success' || value === 'error' || value === 'aborted'
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isTokenUsageEvent(value: unknown): value is TokenUsageEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<TokenUsageEvent>
  return (
    event.version === 1 &&
    typeof event.timestamp === 'string' &&
    Number.isFinite(Date.parse(event.timestamp)) &&
    typeof event.sessionId === 'string' &&
    typeof event.runId === 'string' &&
    typeof event.userInputId === 'string' &&
    typeof event.providerId === 'string' &&
    typeof event.providerName === 'string' &&
    typeof event.modelId === 'string' &&
    isNonNegativeNumber(event.inputTokens) &&
    isNonNegativeNumber(event.outputTokens) &&
    isNonNegativeNumber(event.totalTokens) &&
    isNonNegativeNumber(event.cachedInputTokens) &&
    isMeasurement(event.measurement) &&
    isStatus(event.status) &&
    isNonNegativeNumber(event.durationMs)
  )
}

function writeUsageEvents(
  events: TokenUsageEvent[],
  configDir = getConfigDir(),
): void {
  ensureUsageDir(configDir)
  const filePath = getTokenUsagePath(configDir)
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const content = events.map((event) => JSON.stringify(event)).join('\n')
  fs.writeFileSync(tempPath, content ? `${content}\n` : '', { mode: 0o600 })
  fs.renameSync(tempPath, filePath)
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // Windows does not enforce POSIX modes.
  }
}

export function loadTokenUsageEvents(
  configDir = getConfigDir(),
): TokenUsageEvent[] {
  const filePath = getTokenUsagePath(configDir)
  if (!fs.existsSync(filePath)) return []

  let contents = ''
  try {
    contents = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const events: TokenUsageEvent[] = []
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value = JSON.parse(trimmed)
      if (isTokenUsageEvent(value)) events.push(value)
    } catch {
      // A partial/corrupt line must not hide the remaining valid statistics.
    }
  }
  return events
}

function compactTokenUsageFile(configDir = getConfigDir()): void {
  const cutoff = Date.now() - USAGE_RETENTION_MS
  const events = loadTokenUsageEvents(configDir)
    .filter((event) => Date.parse(event.timestamp) >= cutoff)
    .slice(-MAX_USAGE_EVENTS)
  writeUsageEvents(events, configDir)
}

export function recordTokenUsage(
  event: TokenUsageEvent,
  configDir = getConfigDir(),
): void {
  if (!isTokenUsageEvent(event)) return

  ensureUsageDir(configDir)
  const filePath = getTokenUsagePath(configDir)
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { mode: 0o600 })

  try {
    if (fs.statSync(filePath).size >= COMPACT_AFTER_BYTES) {
      compactTokenUsageFile(configDir)
    }
  } catch {
    // Usage recording is best-effort and must never affect the model request.
  }
}

export function clearTokenUsage(configDir = getConfigDir()): void {
  const filePath = getTokenUsagePath(configDir)
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    // Treat an already missing or locked file as an empty statistics store.
  }
}

export function emptyTokenUsageTotals(): TokenUsageTotals {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    providerMeasured: 0,
    mixedMeasured: 0,
    locallyCalculated: 0,
    successful: 0,
    failed: 0,
    aborted: 0,
    durationMs: 0,
  }
}

export function summarizeTokenUsage(
  events: TokenUsageEvent[],
): TokenUsageTotals {
  const totals = emptyTokenUsageTotals()
  for (const event of events) {
    totals.requests += 1
    totals.inputTokens += event.inputTokens
    totals.outputTokens += event.outputTokens
    totals.totalTokens += event.totalTokens
    totals.cachedInputTokens += event.cachedInputTokens
    totals.durationMs += event.durationMs

    if (event.measurement === 'provider') totals.providerMeasured += 1
    else if (event.measurement === 'mixed') totals.mixedMeasured += 1
    else totals.locallyCalculated += 1

    if (event.status === 'success') totals.successful += 1
    else if (event.status === 'aborted') totals.aborted += 1
    else totals.failed += 1
  }
  return totals
}

export function groupTokenUsage(
  events: TokenUsageEvent[],
  selector: (event: TokenUsageEvent) => { key: string; label: string },
): TokenUsageGroup[] {
  const groups = new Map<string, { label: string; events: TokenUsageEvent[] }>()
  for (const event of events) {
    const selected = selector(event)
    const existing = groups.get(selected.key)
    if (existing) existing.events.push(event)
    else groups.set(selected.key, { label: selected.label, events: [event] })
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      ...summarizeTokenUsage(group.events),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
}

export function filterUsageByProject(
  events: TokenUsageEvent[],
  projectPath: string | null | undefined,
): TokenUsageEvent[] {
  if (!projectPath) return []
  const normalize = (value: string) => {
    const resolved = path.resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const expected = normalize(projectPath)
  return events.filter(
    (event) => event.projectPath && normalize(event.projectPath) === expected,
  )
}
