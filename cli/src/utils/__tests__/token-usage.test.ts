import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  clearTokenUsage,
  filterUsageByProject,
  getTokenUsagePath,
  groupTokenUsage,
  loadTokenUsageEvents,
  recordTokenUsage,
  summarizeTokenUsage,
} from '../token-usage'

import type { TokenUsageEvent } from '@codebuff/common/types/token-usage'

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-usage-'))
  tempDirs.push(dir)
  return dir
}

function event(overrides: Partial<TokenUsageEvent> = {}): TokenUsageEvent {
  return {
    version: 1,
    timestamp: '2026-07-14T00:00:00.000Z',
    sessionId: 'session-1',
    projectPath: path.join(os.tmpdir(), 'project-a'),
    runId: 'run-1',
    userInputId: 'input-1',
    agentType: 'base',
    providerId: 'local',
    providerName: 'Local',
    modelId: 'qwen',
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    cachedInputTokens: 0,
    measurement: 'local',
    status: 'success',
    durationMs: 500,
    ...overrides,
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('local token usage store', () => {
  test('appends and loads JSONL events', () => {
    const dir = createTempDir()
    recordTokenUsage(event(), dir)
    recordTokenUsage(event({ runId: 'run-2', totalTokens: 80 }), dir)

    const loaded = loadTokenUsageEvents(dir)
    expect(loaded).toHaveLength(2)
    expect(loaded[1]?.runId).toBe('run-2')
    expect(getTokenUsagePath(dir)).toBe(path.join(dir, 'usage.jsonl'))
  })

  test('ignores malformed lines without losing valid events', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      getTokenUsagePath(dir),
      `${JSON.stringify(event())}\n{broken json\n${JSON.stringify(event({ runId: 'run-2' }))}\n`,
    )

    expect(loadTokenUsageEvents(dir).map((item) => item.runId)).toEqual([
      'run-1',
      'run-2',
    ])
  })

  test('summarizes input, output and measurement sources', () => {
    const totals = summarizeTokenUsage([
      event(),
      event({
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        measurement: 'provider',
      }),
    ])

    expect(totals.requests).toBe(2)
    expect(totals.inputTokens).toBe(150)
    expect(totals.outputTokens).toBe(30)
    expect(totals.totalTokens).toBe(180)
    expect(totals.providerMeasured).toBe(1)
    expect(totals.locallyCalculated).toBe(1)
  })

  test('groups by model and sorts by total tokens', () => {
    const groups = groupTokenUsage(
      [
        event({ modelId: 'small', totalTokens: 10 }),
        event({ modelId: 'large', totalTokens: 200 }),
      ],
      (item) => ({ key: item.modelId, label: item.modelId }),
    )

    expect(groups.map((group) => group.key)).toEqual(['large', 'small'])
  })

  test('filters the current project and clears the file', () => {
    const dir = createTempDir()
    const projectA = path.join(dir, 'project-a')
    const projectB = path.join(dir, 'project-b')
    const events = [
      event({ projectPath: projectA }),
      event({ projectPath: projectB, runId: 'run-b' }),
    ]

    expect(filterUsageByProject(events, projectA)).toHaveLength(1)

    recordTokenUsage(events[0]!, dir)
    clearTokenUsage(dir)
    expect(loadTokenUsageEvents(dir)).toEqual([])
  })

  test('never stores prompt or response fields in the usage line', () => {
    const dir = createTempDir()
    recordTokenUsage(event(), dir)
    const raw = fs.readFileSync(getTokenUsagePath(dir), 'utf8')

    expect(raw).not.toContain('prompt')
    expect(raw).not.toContain('response')
    expect(raw).not.toContain('apiKey')
  })
})
