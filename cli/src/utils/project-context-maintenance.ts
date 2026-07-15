import fs from 'node:fs'
import path from 'node:path'

import { discoverProjectContext, invalidateProjectContextCache } from './project-context'
import { logger } from './logger'

import type { AgentDefinition, CodebuffClient, RunState } from '@codebuff/sdk'

const AUTO_SECTION_START = '<!-- codewolf:auto-context:start -->'
const AUTO_SECTION_END = '<!-- codewolf:auto-context:end -->'
const MAX_RESULT_TEXT = 12_000
const MAX_INVENTORY_ENTRIES = 80

export type ProjectContextMaintenanceResult = {
  paths: string[]
  createdRecord: boolean
  usedFallback: boolean
}

type ContextWriterOutput = {
  title?: unknown
  objective?: unknown
  decisions?: unknown
  architecture?: unknown
  libraries?: unknown
  problems?: unknown
  solutions?: unknown
  pending?: unknown
  nextSteps?: unknown
  masterSummary?: unknown
}

type NormalizedContextRecord = {
  title: string
  objective: string
  decisions: string[]
  architecture: string[]
  libraries: string[]
  problems: string[]
  solutions: string[]
  pending: string[]
  nextSteps: string[]
  masterSummary: string
}

const CONTEXT_WRITER_AGENT: AgentDefinition = {
  id: 'codewolf-project-context-writer',
  displayName: 'Project Context Writer',
  model: 'anthropic/claude-sonnet-4.6',
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Título breve en español para el documento de contexto.',
      },
      objective: { type: 'string' },
      decisions: { type: 'array', items: { type: 'string' } },
      architecture: { type: 'array', items: { type: 'string' } },
      libraries: { type: 'array', items: { type: 'string' } },
      problems: { type: 'array', items: { type: 'string' } },
      solutions: { type: 'array', items: { type: 'string' } },
      pending: { type: 'array', items: { type: 'string' } },
      nextSteps: { type: 'array', items: { type: 'string' } },
      masterSummary: {
        type: 'string',
        description:
          'Resumen breve del estado actualizado para el contexto maestro.',
      },
    },
    required: [
      'title',
      'objective',
      'decisions',
      'architecture',
      'libraries',
      'problems',
      'solutions',
      'pending',
      'nextSteps',
      'masterSummary',
    ],
  },
  includeMessageHistory: false,
  spawnableAgents: [],
  toolNames: [],
  systemPrompt: `Documenta cambios reales de un proyecto de software en español. Usa exclusivamente la solicitud, el resultado y el inventario suministrados. No inventes pruebas, decisiones, librerías ni problemas. No menciones asistentes, modelos, prompts ni inteligencia artificial. Produce información técnica útil para retomar el proyecto en otra sesión. Si un apartado no tiene datos confirmados, devuelve una lista vacía.`,
  instructionsPrompt:
    'Resume lo implementado con precisión y devuelve únicamente la salida estructurada solicitada.',
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function contextPath(value: string): boolean {
  return /^contexto\/.*\.md$/i.test(normalizePath(value))
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function stripForbiddenReferences(value: string): string {
  return value
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/\b(ChatGPT|OpenAI|IA|inteligencia artificial|asistente|modelo|prompt)\b/i.test(
          line,
        ),
    )
    .join('\n')
    .trim()
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'actualizacion-proyecto'
}

function requestTitle(request: string, forceInit: boolean): string {
  if (forceInit) return 'Inicialización y actualización del contexto del proyecto'
  const line = request
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 4)
  return (line || 'Actualización del proyecto')
    .replace(/^[/#*-]+\s*/, '')
    .replace(/^(?:quiero|necesito|puedes|podrías|por favor)\s+(?:que\s+)?/i, '')
    .replace(/[.!?]+$/, '')
    .slice(0, 100)
}

function collectText(value: unknown, output: string[], depth = 0): void {
  if (output.join('\n').length >= MAX_RESULT_TEXT || depth > 6) return
  if (typeof value === 'string') {
    const text = value.trim()
    if (text) output.push(text)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectText(entry, output, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  for (const key of ['text', 'content', 'message', 'value']) {
    if (key in record) collectText(record[key], output, depth + 1)
  }
}

function summarizeRunState(runState: RunState): string {
  const parts: string[] = []
  collectText(runState.output, parts)
  return stripForbiddenReferences(parts.join('\n')).slice(0, MAX_RESULT_TEXT)
}

function readManifestSummary(projectRoot: string): string[] {
  const summaries: string[] = []
  const packageJson = path.join(projectRoot, 'package.json')
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as {
      name?: unknown
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
    }
    const dependencies = [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ].slice(0, 30)
    summaries.push(
      `package.json${typeof parsed.name === 'string' ? ` (${parsed.name})` : ''}: ${dependencies.length > 0 ? dependencies.join(', ') : 'sin dependencias declaradas'}`,
    )
  } catch {
    // Optional manifest.
  }

  const textManifests = [
    'go.mod',
    'composer.json',
    'pyproject.toml',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
  ]
  for (const name of textManifests) {
    try {
      const content = fs.readFileSync(path.join(projectRoot, name), 'utf8')
      summaries.push(`${name}: ${content.slice(0, 1200).replace(/\s+/g, ' ').trim()}`)
    } catch {
      // Optional manifest.
    }
  }
  return summaries
}

function projectInventory(projectRoot: string): string {
  let entries: string[] = []
  try {
    entries = fs
      .readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => !['.git', 'node_modules', 'vendor', 'dist', 'build'].includes(entry.name))
      .slice(0, MAX_INVENTORY_ENTRIES)
      .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
  } catch {
    // The context fallback still works without an inventory.
  }
  const manifests = readManifestSummary(projectRoot)
  return [...entries, ...manifests].join('\n').slice(0, 24_000)
}

function normalizeOutput(
  output: ContextWriterOutput,
  params: {
    request: string
    changedPaths: string[]
    runSummary: string
    forceInit: boolean
  },
): NormalizedContextRecord {
  const fallbackTitle = requestTitle(params.request, params.forceInit)
  const changed = params.changedPaths.map(normalizePath)
  const resultSummary = params.runSummary.trim()
  return {
    title: stripForbiddenReferences(safeString(output.title, fallbackTitle)),
    objective: stripForbiddenReferences(
      safeString(output.objective, fallbackTitle),
    ),
    decisions: toStringArray(output.decisions).map(stripForbiddenReferences).filter(Boolean),
    architecture: toStringArray(output.architecture).map(stripForbiddenReferences).filter(Boolean),
    libraries: toStringArray(output.libraries).map(stripForbiddenReferences).filter(Boolean),
    problems: toStringArray(output.problems).map(stripForbiddenReferences).filter(Boolean),
    solutions: toStringArray(output.solutions).map(stripForbiddenReferences).filter(Boolean),
    pending: toStringArray(output.pending).map(stripForbiddenReferences).filter(Boolean),
    nextSteps: toStringArray(output.nextSteps).map(stripForbiddenReferences).filter(Boolean),
    masterSummary: stripForbiddenReferences(
      safeString(
        output.masterSummary,
        resultSummary || `Se atendió: ${fallbackTitle}.`,
      ),
    ),
  }
}

function fallbackRecord(params: {
  request: string
  changedPaths: string[]
  runSummary: string
  forceInit: boolean
}): NormalizedContextRecord {
  const title = requestTitle(params.request, params.forceInit)
  return normalizeOutput(
    {
      title,
      objective: title,
      decisions: params.forceInit
        ? ['Se habilitó la memoria persistente del proyecto mediante contexto/.']
        : [],
      architecture: [],
      libraries: [],
      problems: [],
      solutions: params.runSummary ? [params.runSummary.slice(0, 1200)] : [],
      pending: ['Validar manualmente el comportamiento modificado antes de confirmar el cambio.'],
      nextSteps: ['Continuar desde el contexto maestro y el registro más reciente.'],
      masterSummary: params.runSummary || `Se atendió: ${title}.`,
    },
    params,
  )
}

async function generateRecord(params: {
  client: CodebuffClient
  projectRoot: string
  request: string
  changedPaths: string[]
  runSummary: string
  forceInit: boolean
}): Promise<{ record: NormalizedContextRecord; usedFallback: boolean }> {
  const prompt = [
    `Solicitud:\n${params.request.slice(0, 6000)}`,
    `Tipo de operación: ${params.forceInit ? 'inicialización o actualización general del contexto' : 'implementación terminada'}`,
    `Archivos modificados:\n${params.changedPaths.join('\n') || '(ninguno informado)'}`,
    `Resultado del turno:\n${params.runSummary || '(sin resumen textual disponible)'}`,
    `Inventario del proyecto:\n${projectInventory(params.projectRoot) || '(no disponible)'}`,
  ].join('\n\n')

  try {
    const runState = await params.client.run({
      agent: CONTEXT_WRITER_AGENT,
      prompt,
      maxAgentSteps: 2,
    })
    if (
      runState.output.type === 'structuredOutput' &&
      runState.output.value &&
      typeof runState.output.value === 'object'
    ) {
      return {
        record: normalizeOutput(
          runState.output.value as ContextWriterOutput,
          params,
        ),
        usedFallback: false,
      }
    }
  } catch (error) {
    logger.warn({ error }, '[contexto] Context maintenance agent failed')
  }
  return { record: fallbackRecord(params), usedFallback: true }
}

function bullets(values: string[], empty: string): string {
  return values.length > 0
    ? values.map((value) => `- ${value}`).join('\n')
    : `- ${empty}`
}

function renderRecord(params: {
  number: number
  record: NormalizedContextRecord
  changedPaths: string[]
}): string {
  const prefix = String(params.number).padStart(3, '0')
  return `# ${prefix} — ${params.record.title}\n\n# Fecha\n\n${new Date().toISOString().slice(0, 10)}\n\n# Objetivo\n\n${params.record.objective}\n\n# Decisiones tomadas\n\n${bullets(params.record.decisions, 'No se registraron decisiones adicionales confirmadas.')}\n\n# Arquitectura actual\n\n${bullets(params.record.architecture, 'Se conserva la arquitectura existente salvo los archivos indicados.')}\n\n# Librerías usadas\n\n${bullets(params.record.libraries, 'No se registraron dependencias nuevas en este cambio.')}\n\n# Archivos importantes modificados\n\n${bullets(params.changedPaths.map(normalizePath), 'No se informaron archivos modificados.')}\n\n# Problemas encontrados\n\n${bullets(params.record.problems, 'No se registraron problemas adicionales confirmados.')}\n\n# Soluciones implementadas\n\n${bullets(params.record.solutions, params.record.masterSummary)}\n\n# Pendientes\n\n${bullets(params.record.pending, 'Sin pendientes adicionales confirmados.')}\n\n# Próximos pasos\n\n${bullets(params.record.nextSteps, 'Validar el cambio y continuar desde el contexto más reciente.')}\n`
}

function autoMasterSection(params: {
  record: NormalizedContextRecord
  recordPath?: string
  changedPaths: string[]
}): string {
  return `${AUTO_SECTION_START}\n# Estado automático más reciente\n\n- Última actualización: ${new Date().toISOString()}\n- Último registro: ${params.recordPath ?? 'actualización directa del contexto maestro'}\n- Resumen: ${params.record.masterSummary}\n- Archivos del cambio: ${params.changedPaths.map(normalizePath).join(', ') || 'ninguno informado'}\n${AUTO_SECTION_END}`
}

async function writeMasterContext(params: {
  projectRoot: string
  contextDir: string
  record: NormalizedContextRecord
  recordPath?: string
  changedPaths: string[]
  onBeforeWrite?: (relativePath: string) => Promise<void>
  onAfterWrite?: (relativePath: string) => Promise<void>
}): Promise<{ relativePath: string; changed: boolean }> {
  const target = path.join(params.contextDir, '000-contexto-maestro.md')
  const section = autoMasterSection(params)
  let next: string
  try {
    const current = fs.readFileSync(target, 'utf8')
    const pattern = new RegExp(
      `${AUTO_SECTION_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${AUTO_SECTION_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    )
    next = pattern.test(current)
      ? current.replace(pattern, section)
      : `${current.trimEnd()}\n\n${section}\n`
    if (next === current) return { relativePath: 'contexto/000-contexto-maestro.md', changed: false }
  } catch {
    next = `# 000 — Contexto maestro del proyecto\n\n# Fecha\n\n${new Date().toISOString().slice(0, 10)}\n\n# Objetivo\n\nConservar el estado técnico, las reglas y los pendientes necesarios para retomar el proyecto.\n\n# Decisiones tomadas\n\n- La carpeta contexto/ es la memoria persistente del proyecto.\n\n# Arquitectura actual\n\n- Consultar los registros numerados y verificar el código fuente antes de cambiar la arquitectura.\n\n# Librerías usadas\n\n- Consultar los manifiestos del proyecto y los registros numerados.\n\n# Archivos importantes modificados\n\n- Consultar el registro más reciente.\n\n# Problemas encontrados\n\n- Consultar el registro más reciente.\n\n# Soluciones implementadas\n\n- Consultar el registro más reciente.\n\n# Pendientes\n\n- Mantener este archivo actualizado después de cambios importantes.\n\n# Próximos pasos\n\n- Leer este documento y luego los archivos numerados en orden.\n\n${section}\n`
  }
  const relativePath = 'contexto/000-contexto-maestro.md'
  await params.onBeforeWrite?.(relativePath)
  fs.mkdirSync(params.contextDir, { recursive: true })
  fs.writeFileSync(target, next)
  await params.onAfterWrite?.(relativePath)
  return { relativePath, changed: true }
}

export async function maintainProjectContext(params: {
  projectRoot: string
  client: CodebuffClient
  request: string
  changedPaths: Iterable<string>
  runState: RunState
  forceInit?: boolean
  onBeforeWrite?: (relativePath: string) => Promise<void>
  onAfterWrite?: (relativePath: string) => Promise<void>
}): Promise<ProjectContextMaintenanceResult> {
  const changedPaths = [...new Set([...params.changedPaths].map(normalizePath))].sort()
  const existingContextPaths = changedPaths.filter(contextPath)
  const existingNumberedRecords = existingContextPaths.filter(
    (entry) => !/^contexto\/0+(?:[-_]|contexto-maestro)/i.test(entry),
  )
  const nonContextPaths = changedPaths.filter((entry) => !contextPath(entry))
  const forceInit = params.forceInit === true

  if (!forceInit && nonContextPaths.length === 0) {
    return { paths: existingContextPaths, createdRecord: false, usedFallback: false }
  }

  const contextDir = path.join(path.resolve(params.projectRoot), 'contexto')
  fs.mkdirSync(contextDir, { recursive: true })
  const runSummary = summarizeRunState(params.runState)
  const { record, usedFallback } = await generateRecord({
    client: params.client,
    projectRoot: params.projectRoot,
    request: params.request,
    changedPaths: nonContextPaths,
    runSummary,
    forceInit,
  })

  let recordPath: string | undefined
  let createdRecord = false
  if (existingNumberedRecords.length === 0) {
    const discovery = discoverProjectContext(params.projectRoot)
    const nextNumber = Math.max(discovery?.nextNumber ?? 1, 1)
    const fileName = `${String(nextNumber).padStart(3, '0')}-${slugify(record.title)}.md`
    recordPath = `contexto/${fileName}`
    await params.onBeforeWrite?.(recordPath)
    fs.writeFileSync(
      path.join(params.projectRoot, recordPath),
      renderRecord({ number: nextNumber, record, changedPaths: nonContextPaths }),
    )
    await params.onAfterWrite?.(recordPath)
    createdRecord = true
  } else {
    recordPath = existingNumberedRecords.at(-1)
  }

  const master = await writeMasterContext({
    projectRoot: params.projectRoot,
    contextDir,
    record,
    recordPath,
    changedPaths: nonContextPaths.length > 0 ? nonContextPaths : existingContextPaths,
    onBeforeWrite: params.onBeforeWrite,
    onAfterWrite: params.onAfterWrite,
  })
  invalidateProjectContextCache(params.projectRoot)

  return {
    paths: [
      ...new Set([
        ...existingContextPaths,
        ...(recordPath ? [recordPath] : []),
        ...(master.changed ? [master.relativePath] : []),
      ]),
    ].sort(),
    createdRecord,
    usedFallback,
  }
}

export async function ensureInitialProjectContext(params: {
  projectRoot: string
  onBeforeWrite?: (relativePath: string) => Promise<void>
  onAfterWrite?: (relativePath: string) => Promise<void>
}): Promise<string[]> {
  const contextDir = path.join(path.resolve(params.projectRoot), 'contexto')
  fs.mkdirSync(contextDir, { recursive: true })
  const relativePath = 'contexto/000-contexto-maestro.md'
  const masterPath = path.join(params.projectRoot, relativePath)
  if (fs.existsSync(masterPath)) return []
  const placeholder = `# 000 — Contexto maestro del proyecto\n\n# Fecha\n\n${new Date().toISOString().slice(0, 10)}\n\n# Objetivo\n\nInicializar la memoria persistente del proyecto. El comando /init debe completar este documento después de analizar la estructura, documentación, dependencias y código relevante.\n\n# Decisiones tomadas\n\n- Usar contexto/ como memoria técnica persistente.\n\n# Arquitectura actual\n\n- Pendiente de análisis por /init.\n\n# Librerías usadas\n\n- Pendiente de análisis por /init.\n\n# Archivos importantes modificados\n\n- contexto/000-contexto-maestro.md\n\n# Problemas encontrados\n\n- Pendiente de análisis por /init.\n\n# Soluciones implementadas\n\n- Se creó la estructura inicial de contexto/.\n\n# Pendientes\n\n- Completar el análisis del proyecto.\n\n# Próximos pasos\n\n- Ejecutar el flujo de inicialización y crear el primer registro numerado.\n`
  await params.onBeforeWrite?.(relativePath)
  fs.writeFileSync(masterPath, placeholder)
  await params.onAfterWrite?.(relativePath)
  invalidateProjectContextCache(params.projectRoot)
  return [relativePath]
}
