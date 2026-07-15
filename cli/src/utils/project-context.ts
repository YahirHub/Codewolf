import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { getProjectDataDirForRoot } from '../project-files'
import {
  CONTEXT_FILE_TEMPLATE,
  DEVELOPMENT_METHODOLOGY_KNOWLEDGE,
} from './development-methodology'
import { isProjectContextEnabled, isVerifiedCommitsEnabled } from './settings'
import { logger } from './logger'

import type { AgentDefinition, CodebuffClient } from '@codebuff/sdk'

const CACHE_VERSION = 1
const MAX_CONTEXT_FILES = 200
const MAX_CONTEXT_BYTES = 320_000
const MAX_SINGLE_CONTEXT_FILE_BYTES = 80_000
export const PROJECT_METHODOLOGY_VIRTUAL_PATH =
  '.codewolf/metodologia-desarrollo.md'
export const PROJECT_CONTEXT_SUMMARY_VIRTUAL_PATH =
  '.codewolf/contexto-resumen.md'

export const PROJECT_CONTEXT_VIRTUAL_PATHS = [
  PROJECT_METHODOLOGY_VIRTUAL_PATH,
  PROJECT_CONTEXT_SUMMARY_VIRTUAL_PATH,
] as const

export type ProjectContextDiscovery = {
  projectRoot: string
  contextDir: string
  files: Array<{ relativePath: string; content: string }>
  fingerprint: string
  nextNumber: number
  truncated: boolean
}

type ProjectContextCache = {
  version: 1
  fingerprint: string
  generatedAt: string
  summary: string
  nextNumber: number
  files: string[]
  warnings: string[]
}

type ContextSummaryOutput = {
  summary?: unknown
  nextContextNumber?: unknown
  warnings?: unknown
}

const inflightSummaries = new Map<string, Promise<ProjectContextCache>>()
const memoryCache = new Map<string, ProjectContextCache>()

const CONTEXT_SUMMARIZER_AGENT: AgentDefinition = {
  id: 'codewolf-project-context-summarizer',
  displayName: 'Project Context Summarizer',
  model: 'anthropic/claude-sonnet-4.6',
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'A high-signal Spanish summary of current project architecture, rules, decisions, completed work, risks and pending tasks.',
      },
      nextContextNumber: {
        type: 'number',
        description:
          'The next available numeric prefix for a contexto markdown file.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Conflicts, stale notes or important uncertainties found across the context files.',
      },
    },
    required: ['summary', 'nextContextNumber', 'warnings'],
  },
  includeMessageHistory: false,
  spawnableAgents: [],
  toolNames: [],
  systemPrompt: `You summarize persistent software-project context for another coding agent. The supplied knowledge files are ordered markdown records from contexto/. Treat higher numeric files as newer. Produce a compact but implementation-useful Spanish summary. Preserve hard constraints, architecture, compatibility requirements, important bugs, completed work, tests, risks and pending tasks. Do not invent facts and do not include secrets. Call out contradictions or stale notes in warnings. Do not write files or suggest a solution to a new coding task.`,
  instructionsPrompt:
    'Read every supplied context file and return only the requested structured output.',
}

function contextCachePath(projectRoot: string): string {
  return path.join(
    getProjectDataDirForRoot(projectRoot),
    'context-summary.json',
  )
}

function numericPrefix(fileName: string): number | null {
  const match = fileName.match(/^(\d+)[-_]/)
  if (!match) return null
  const value = Number.parseInt(match[1] ?? '', 10)
  return Number.isFinite(value) ? value : null
}

function safeReadCache(projectRoot: string): ProjectContextCache | null {
  const cached = memoryCache.get(path.resolve(projectRoot))
  if (cached) return cached

  try {
    const parsed = JSON.parse(
      fs.readFileSync(contextCachePath(projectRoot), 'utf8'),
    ) as Partial<ProjectContextCache>
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.fingerprint !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.nextNumber !== 'number' ||
      !Array.isArray(parsed.files) ||
      !Array.isArray(parsed.warnings)
    ) {
      return null
    }
    const normalized = parsed as ProjectContextCache
    memoryCache.set(path.resolve(projectRoot), normalized)
    return normalized
  } catch {
    return null
  }
}

function saveCache(projectRoot: string, cache: ProjectContextCache): void {
  try {
    const target = contextCachePath(projectRoot)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temporary = `${target}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(cache, null, 2))
    fs.renameSync(temporary, target)
    memoryCache.set(path.resolve(projectRoot), cache)
  } catch (error) {
    logger.warn({ error }, '[contexto] Failed to save context summary cache')
  }
}

export function discoverProjectContext(
  projectRoot: string,
): ProjectContextDiscovery | null {
  const resolvedRoot = path.resolve(projectRoot)
  const contextDir = path.join(resolvedRoot, 'contexto')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(contextDir, { withFileTypes: true })
  } catch {
    return null
  }

  const allMarkdownFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'),
    )
    .sort((a, b) => {
      const aNumber = numericPrefix(a.name)
      const bNumber = numericPrefix(b.name)
      if (aNumber !== null && bNumber !== null && aNumber !== bNumber) {
        return aNumber - bNumber
      }
      if (aNumber !== null && bNumber === null) return -1
      if (aNumber === null && bNumber !== null) return 1
      return a.name.localeCompare(b.name, 'es')
    })
  const masterEntry = allMarkdownFiles.find(
    (entry) => numericPrefix(entry.name) === 0,
  )
  const priorityEntries = [
    ...(masterEntry ? [masterEntry] : []),
    ...[...allMarkdownFiles].reverse().filter((entry) => entry !== masterEntry),
  ]

  const files: ProjectContextDiscovery['files'] = []
  let totalBytes = 0
  let truncated = false
  const highestNumber = allMarkdownFiles.reduce((highest, entry) => {
    const prefix = numericPrefix(entry.name)
    return prefix === null ? highest : Math.max(highest, prefix)
  }, -1)
  const hash = crypto.createHash('sha256')

  // Include every context filename and basic metadata in the cache key, even
  // when the safe read limit prevents sending every document to the summarizer.
  // This avoids reusing a stale summary after a newer high-numbered file is
  // added beyond the automatic read window.
  for (const entry of allMarkdownFiles) {
    hash.update(entry.name)
    try {
      const stat = fs.statSync(path.join(contextDir, entry.name))
      hash.update(String(stat.size))
      hash.update(String(stat.mtimeMs))
    } catch {
      hash.update('unreadable')
    }
    hash.update('\0')
  }

  // Under the safety cap, preserve the master context and prioritize the most
  // recent numbered records. The returned list is sorted chronologically for
  // the summarizer after selection.
  for (const entry of priorityEntries) {
    if (files.length >= MAX_CONTEXT_FILES || totalBytes >= MAX_CONTEXT_BYTES) {
      truncated = true
      break
    }

    const fullPath = path.join(contextDir, entry.name)
    let content: string
    try {
      content = fs.readFileSync(fullPath, 'utf8')
    } catch {
      truncated = true
      continue
    }

    const contentBytes = Buffer.byteLength(content)
    const allowedBytes = Math.min(
      contentBytes,
      MAX_SINGLE_CONTEXT_FILE_BYTES,
      MAX_CONTEXT_BYTES - totalBytes,
    )
    if (allowedBytes < contentBytes) {
      content = Buffer.from(content).subarray(0, allowedBytes).toString('utf8')
      truncated = true
    }

    totalBytes += Buffer.byteLength(content)
    files.push({ relativePath: `contexto/${entry.name}`, content })
    hash.update(entry.name)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }

  if (files.length < allMarkdownFiles.length) truncated = true

  const fileOrder = new Map(
    allMarkdownFiles.map((entry, index) => [`contexto/${entry.name}`, index]),
  )
  files.sort(
    (a, b) =>
      (fileOrder.get(a.relativePath) ?? Number.MAX_SAFE_INTEGER) -
      (fileOrder.get(b.relativePath) ?? Number.MAX_SAFE_INTEGER),
  )

  return {
    projectRoot: resolvedRoot,
    contextDir,
    files,
    fingerprint: hash.digest('hex'),
    nextNumber: highestNumber + 1,
    truncated,
  }
}

function normalizeSummaryOutput(
  output: ContextSummaryOutput,
  discovery: ProjectContextDiscovery,
): ProjectContextCache {
  const summary =
    typeof output.summary === 'string' && output.summary.trim()
      ? output.summary.trim()
      : `Se detectaron ${discovery.files.length} archivos en contexto/. Antes de modificar el proyecto, lee los documentos relevantes en orden numérico.`
  const nextNumber =
    typeof output.nextContextNumber === 'number' &&
    Number.isFinite(output.nextContextNumber) &&
    output.nextContextNumber >= discovery.nextNumber
      ? Math.floor(output.nextContextNumber)
      : discovery.nextNumber
  const warnings = Array.isArray(output.warnings)
    ? output.warnings.filter(
        (warning): warning is string =>
          typeof warning === 'string' && warning.trim().length > 0,
      )
    : []

  if (discovery.truncated) {
    warnings.push(
      'La lectura automática de contexto alcanzó el límite de seguridad; abre manualmente archivos adicionales si la tarea lo requiere.',
    )
  }

  return {
    version: CACHE_VERSION,
    fingerprint: discovery.fingerprint,
    generatedAt: new Date().toISOString(),
    summary,
    nextNumber,
    files: discovery.files.map((file) => file.relativePath),
    warnings,
  }
}

async function generateSummary(
  client: CodebuffClient,
  discovery: ProjectContextDiscovery,
): Promise<ProjectContextCache> {
  const knowledgeFiles = Object.fromEntries(
    discovery.files.map((file) => [file.relativePath, file.content]),
  )

  try {
    const runState = await client.run({
      agent: CONTEXT_SUMMARIZER_AGENT,
      prompt:
        'Resume la memoria persistente del proyecto para que el agente principal pueda continuar trabajando sin releer todo el historial.',
      knowledgeFiles,
      maxAgentSteps: 2,
    })
    if (
      runState.output.type === 'structuredOutput' &&
      runState.output.value &&
      typeof runState.output.value === 'object'
    ) {
      return normalizeSummaryOutput(
        runState.output.value as ContextSummaryOutput,
        discovery,
      )
    }
  } catch (error) {
    logger.warn({ error }, '[contexto] Agent summary failed')
  }

  return normalizeSummaryOutput({}, discovery)
}

async function getOrGenerateSummary(
  client: CodebuffClient,
  discovery: ProjectContextDiscovery,
): Promise<ProjectContextCache> {
  const resolvedRoot = path.resolve(discovery.projectRoot)
  const cached = safeReadCache(resolvedRoot)
  if (cached?.fingerprint === discovery.fingerprint) return cached

  const key = `${resolvedRoot}:${discovery.fingerprint}`
  const existing = inflightSummaries.get(key)
  if (existing) return existing

  const pending = generateSummary(client, discovery)
    .then((summary) => {
      saveCache(resolvedRoot, summary)
      return summary
    })
    .finally(() => {
      inflightSummaries.delete(key)
    })
  inflightSummaries.set(key, pending)
  return pending
}

function renderContextKnowledge(
  summary: ProjectContextCache | null,
  discovery: ProjectContextDiscovery | null,
): string {
  if (!discovery) {
    return `# Integración de contexto persistente

La función está activada, pero el proyecto todavía no contiene contexto/.

Cuando realices el primer cambio importante, crea contexto/000-contexto-maestro.md y el siguiente archivo numerado usando la plantilla de la metodología. No crees archivos de contexto para cambios triviales.`
  }

  if (discovery.files.length === 0) {
    return `# Integración de contexto persistente

El proyecto contiene contexto/, pero todavía no tiene documentos Markdown.

Siguiente prefijo sugerido: ${String(discovery.nextNumber).padStart(3, '0')}

Cuando realices un cambio importante, crea contexto/000-contexto-maestro.md y el siguiente archivo numerado usando la plantilla de la metodología.`
  }

  const warnings = summary?.warnings.length
    ? `\n\n## Advertencias\n${summary.warnings.map((warning) => `- ${warning}`).join('\n')}`
    : ''
  const files = discovery.files
    .map((file) => `- ${file.relativePath}`)
    .join('\n')

  return `# Resumen automático de contexto/

Huella: ${discovery.fingerprint}
Siguiente prefijo sugerido: ${String(summary?.nextNumber ?? discovery.nextNumber).padStart(3, '0')}

## Resumen

${summary?.summary ?? 'Lee los documentos relevantes de contexto/ antes de realizar cambios importantes.'}
${warnings}

## Archivos considerados

${files || '- Ninguno'}

Este resumen es una ayuda, no sustituye la lectura de los documentos fuente cuando una decisión concreta depende de ellos. Los archivos con numeración más alta suelen ser más recientes.`
}

export async function prepareProjectContextKnowledge(params: {
  projectRoot: string
  client: CodebuffClient
}): Promise<Record<string, string> | undefined> {
  const projectContextEnabled = isProjectContextEnabled()
  const verifiedCommitsEnabled = isVerifiedCommitsEnabled()
  if (!projectContextEnabled && !verifiedCommitsEnabled) return undefined

  const knowledge: Record<string, string> = {
    [PROJECT_METHODOLOGY_VIRTUAL_PATH]: `# Opciones activas\n\n- Contexto persistente: ${projectContextEnabled ? 'ACTIVADO' : 'DESACTIVADO'}\n- Commits verificados: ${verifiedCommitsEnabled ? 'ACTIVADO' : 'DESACTIVADO'}\n\n${DEVELOPMENT_METHODOLOGY_KNOWLEDGE}

## Plantilla de documento contexto/

${CONTEXT_FILE_TEMPLATE}`,
  }

  if (projectContextEnabled) {
    const discovery = discoverProjectContext(params.projectRoot)
    const summary =
      discovery && discovery.files.length > 0
        ? await getOrGenerateSummary(params.client, discovery)
        : null
    knowledge[PROJECT_CONTEXT_SUMMARY_VIRTUAL_PATH] = renderContextKnowledge(
      summary,
      discovery,
    )
  }

  return knowledge
}

export async function prefetchProjectContextSummary(params: {
  projectRoot: string
  client: CodebuffClient
}): Promise<void> {
  if (!isProjectContextEnabled()) return
  const discovery = discoverProjectContext(params.projectRoot)
  if (!discovery || discovery.files.length === 0) return
  await getOrGenerateSummary(params.client, discovery)
}

export function invalidateProjectContextCache(projectRoot?: string): void {
  if (projectRoot) {
    memoryCache.delete(path.resolve(projectRoot))
    return
  }
  memoryCache.clear()
}

export const __projectContextInternals = {
  numericPrefix,
  renderContextKnowledge,
  normalizeSummaryOutput,
}
