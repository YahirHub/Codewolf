import fs from 'node:fs'
import path from 'node:path'

import { discoverProjectContext, invalidateProjectContextCache } from './project-context'
import { logger } from './logger'

import type { AgentDefinition, CodebuffClient, RunState } from '@codebuff/sdk'

const AUTO_SECTION_START = '<!-- codewolf:auto-context:start -->'
const AUTO_SECTION_END = '<!-- codewolf:auto-context:end -->'
const AUTO_RECORD_MARKER = '<!-- codewolf:auto-context:record -->'
const MAX_RESULT_TEXT = 6_000
const MAX_INVENTORY_ENTRIES = 80
const MAX_TITLE_LENGTH = 72
const MAX_OBJECTIVE_LENGTH = 280
const MAX_ITEM_LENGTH = 240
const MAX_ITEMS_PER_SECTION = 8

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

type TechnicalSummary = Pick<
  NormalizedContextRecord,
  | 'decisions'
  | 'architecture'
  | 'libraries'
  | 'problems'
  | 'solutions'
  | 'pending'
  | 'nextSteps'
>

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
        description: 'Título técnico breve en español, máximo 72 caracteres.',
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
        description: 'Resumen técnico breve del estado actualizado.',
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
  systemPrompt: `Documenta únicamente hechos técnicos confirmados del proyecto en español.
No copies la solicitud ni la respuesta completa. No uses texto conversacional, tablas Markdown, encabezados dentro de campos ni frases de relleno.
El título debe ser una acción técnica corta, por ejemplo: "Agregar detención manual del escaneo".
Cada elemento debe contener una sola idea verificable. Devuelve listas vacías cuando no haya información real.
No inventes pruebas, decisiones, dependencias, arquitectura, problemas ni pendientes. No menciones asistentes, modelos, prompts ni inteligencia artificial.`,
  instructionsPrompt:
    'Devuelve solo la salida estructurada y conserva cada campo breve y factual.',
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function contextPath(value: string): boolean {
  return /^contexto\/.*\.md$/i.test(normalizePath(value))
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateAtWord(value: string, limit: number): string {
  const compact = compactWhitespace(value)
  if (compact.length <= limit) return compact
  const contentLimit = Math.max(1, limit - 1)
  const sliced = compact.slice(0, contentLimit + 1)
  const lastSpace = sliced.lastIndexOf(' ')
  const end = lastSpace > contentLimit * 0.6 ? lastSpace : contentLimit
  return `${sliced.slice(0, end).trim()}…`
}

function stripForbiddenReferences(value: string): string {
  return value
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/\b(ChatGPT|OpenAI|IA|inteligencia artificial|asistente de IA|modelo de lenguaje|LLM|prompt del sistema)\b/i.test(
          line,
        ),
    )
    .join('\n')
    .trim()
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+/, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .trim()
}

const NOISE_LINE_PATTERNS = [
  /^the user(?:'s)? request/i,
  /^let me\b/i,
  /^i (?:have|will|am|can)\b/i,
  /^voy a\b/i,
  /^he (?:completado|terminado)\b/i,
  /^(?:resumen|summary)$/i,
  /^\d+\s+archivos?\s+(?:modificados?|creados?)/i,
  /^(?:archivo|file)\s*\|\s*(?:cambio|change)$/i,
  /^[-:|\s]+$/,
  /^no se (?:registraron|informaron|detectaron)\b/i,
  /^se conserva la arquitectura existente salvo\b/i,
  /^sin pendientes adicionales\b/i,
  /^continuar desde el contexto maestro\b/i,
  /^validar (?:manualmente )?(?:el cambio|el comportamiento modificado)\b/i,
]

function cleanContextItem(value: string): string {
  const cleaned = truncateAtWord(
    compactWhitespace(stripMarkdown(stripForbiddenReferences(value)))
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .replace(/\s+([,.;:])/g, '$1'),
    MAX_ITEM_LENGTH,
  )
  if (!cleaned || NOISE_LINE_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return ''
  }
  if (/^\|.*\|$/.test(cleaned)) return ''
  return cleaned
}

function uniqueItems(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawValue of values) {
    const value = cleanContextItem(rawValue)
    if (!value) continue
    const key = value.toLocaleLowerCase('es')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
    if (result.length >= MAX_ITEMS_PER_SECTION) break
  }
  return result
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueItems(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .flatMap((entry) => entry.split(/\r?\n/)),
  )
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const cleaned = cleanContextItem(value)
  return cleaned || fallback
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
    .replace(/-+$/g, '')
  return slug || 'actualizacion-proyecto'
}

const ACTION_VERBS: Array<[RegExp, string]> = [
  [/^(?:agrega|agregar|añade|añadir)\b/i, 'Agregar'],
  [/^(?:implementa|implementar)\b/i, 'Implementar'],
  [/^(?:corrige|corregir|soluciona|solucionar|arregla|arreglar)\b/i, 'Corregir'],
  [/^(?:mejora|mejorar|optimiza|optimizar)\b/i, 'Mejorar'],
  [/^(?:actualiza|actualizar)\b/i, 'Actualizar'],
  [/^(?:elimina|eliminar|quita|quitar)\b/i, 'Eliminar'],
  [/^(?:renombra|renombrar)\b/i, 'Renombrar'],
  [/^(?:integra|integrar)\b/i, 'Integrar'],
  [/^(?:permite|permitir|habilita|habilitar)\b/i, 'Permitir'],
  [/^(?:evita|evitar|impide|impedir)\b/i, 'Evitar'],
  [/^(?:crea|crear)\b/i, 'Crear'],
  [/^(?:documenta|documentar)\b/i, 'Documentar'],
]

function toInfinitiveAction(value: string): string {
  const normalized = value.toLocaleLowerCase('es')
  if (/^(?:agrega|agregar|añade|añadir)$/.test(normalized)) return 'Agregar'
  if (/^(?:implementa|implementar)$/.test(normalized)) return 'Implementar'
  if (/^(?:corrige|corregir|soluciona|solucionar|arregla|arreglar)$/.test(normalized)) return 'Corregir'
  if (/^(?:mejora|mejorar|optimiza|optimizar)$/.test(normalized)) return 'Mejorar'
  if (/^(?:actualiza|actualizar)$/.test(normalized)) return 'Actualizar'
  if (/^(?:elimina|eliminar|quita|quitar)$/.test(normalized)) return 'Eliminar'
  if (/^(?:renombra|renombrar)$/.test(normalized)) return 'Renombrar'
  if (/^(?:integra|integrar)$/.test(normalized)) return 'Integrar'
  if (/^(?:permite|permitir|habilita|habilitar)$/.test(normalized)) return 'Permitir'
  if (/^(?:evita|evitar|impide|impedir)$/.test(normalized)) return 'Evitar'
  if (/^(?:crea|crear)$/.test(normalized)) return 'Crear'
  if (/^(?:documenta|documentar)$/.test(normalized)) return 'Documentar'
  return ''
}

function findInlineAction(value: string): string | null {
  const match = value.match(
    /\b(agrega(?:r)?|añade|añadir|implementa(?:r)?|corrige|corregir|soluciona|solucionar|arregla|arreglar|mejora|mejorar|optimiza|optimizar|actualiza|actualizar|elimina|eliminar|quita|quitar|renombra|renombrar|integra|integrar|permite|permitir|habilita|habilitar|evita|evitar|impide|impedir|crea|crear|documenta|documentar)\b\s+(.+?)(?=\s*[,;.]|\s+(?:adem[aá]s|también|de paso|luego|después)\b|$)/i,
  )
  if (!match) return null
  const action = toInfinitiveAction(match[1])
  return action ? `${action} ${match[2]}` : null
}

function fallbackTitleFromPaths(changedPaths: string[]): string {
  const sourcePaths = changedPaths.filter((entry) => !contextPath(entry))
  if (sourcePaths.length === 1) {
    return `Actualizar ${path.posix.basename(normalizePath(sourcePaths[0]))}`
  }
  if (sourcePaths.length > 1) {
    const parents = sourcePaths.map((entry) => path.posix.dirname(normalizePath(entry)))
    if (parents.every((entry) => entry === parents[0]) && parents[0] !== '.') {
      return `Actualizar ${path.posix.basename(parents[0])}`
    }
  }
  return 'Actualizar implementación del proyecto'
}

function normalizeTechnicalPhrase(value: string): string {
  let phrase = compactWhitespace(value)
    .replace(/[“”"']/g, '')
    .replace(/\s*\/\s*/g, ' o ')
    .replace(/\bescaneo\s+en\s+proceso\s+o\s+escaneo\s+activo\b/gi, 'escaneo activo')
    .replace(/\b(en proceso)\s+o\s+activo\b/gi, 'activo')
    .replace(/\s+(?:por favor|gracias)$/i, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim()

  for (const [pattern, infinitive] of ACTION_VERBS) {
    if (pattern.test(phrase)) {
      phrase = phrase.replace(pattern, infinitive)
      break
    }
  }
  return phrase
}

function requestTitle(
  request: string,
  forceInit: boolean,
  changedPaths: string[],
): string {
  if (forceInit) return 'Inicializar contexto del proyecto'

  const normalized = compactWhitespace(request)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\/?(?:contin[uú]a|sigue|procede|hazlo)\.?$/i, '')
  if (!normalized) return fallbackTitleFromPaths(changedPaths)

  const withoutPreamble = normalized
    .replace(/^(?:(?:ahora|adem[aá]s|también|de paso|primero|por favor)\s*[,;:]?\s*)+/i, '')
    .replace(/^antes de (?:empezar|continuar)[,;:]?\s*/i, '')
    .replace(/^hay un detalle(?:\s+y\s+es\s+que)?\s*/i, '')
    .replace(/^el (?:detalle|problema)(?:\s+actual)?\s+es\s+que\s*/i, '')
    .replace(/^(?:quiero|necesito|me gustar[ií]a|quisiera|puedes|podr[ií]as)\s+(?:que\s+)?/i, '')

  const noCapability = withoutPreamble.match(
    /^no (?:hay|existe) (?:una )?manera de\s+(.+?)(?=\s*[,;.]|\s+(?:me gustar[ií]a|quiero|necesito|adem[aá]s|también)\b|$)/i,
  )
  const statedIssue = withoutPreamble.match(
    /^(?:hay|existe) (?:un|una) (?:bug|error|fallo|problema)(?:\s+(?:donde|que|en))?\s+(.+)/i,
  )
  const inlineAction =
    noCapability || statedIssue ? null : findInlineAction(withoutPreamble)
  let candidate = noCapability
    ? `Permitir ${noCapability[1]}`
    : statedIssue
      ? `Corregir fallo donde ${statedIssue[1]}`
      : inlineAction ??
        withoutPreamble.split(/(?<=[.!?;])\s+|\s*,\s*(?=(?:adem[aá]s|también|me gustar[ií]a|quiero|necesito)\b)/i)[0]

  candidate = normalizeTechnicalPhrase(candidate)
  if (/^Corregir (?:este|el|un) (?:error|bug|fallo|problema)$/i.test(candidate)) {
    const detail = withoutPreamble.split(/[,;:]/).slice(1).join(' ').trim()
    if (detail) candidate = `Corregir error cuando ${detail}`
  }
  if (!ACTION_VERBS.some(([pattern]) => pattern.test(candidate))) {
    if (/\b(?:bug|error|fallo|problema)\b/i.test(candidate)) {
      candidate = `Corregir ${candidate.replace(/^(?:un|una|el|la)?\s*(?:bug|error|fallo|problema)\s*(?:donde|que|en)?\s*/i, '')}`
    } else if (!/^Permitir\b/i.test(candidate)) {
      candidate = `Actualizar ${candidate}`
    }
  }

  candidate = normalizeTechnicalPhrase(candidate)
  if (candidate.length < 8 || /^Actualizar\s+(?:esto|eso|cambio|detalle)$/i.test(candidate)) {
    candidate = fallbackTitleFromPaths(changedPaths)
  }
  return truncateAtWord(
    candidate.charAt(0).toUpperCase() + candidate.slice(1),
    MAX_TITLE_LENGTH,
  )
}

function objectiveFromTitle(title: string): string {
  return `${truncateAtWord(title, MAX_OBJECTIVE_LENGTH).replace(/[.!?]+$/, '')}.`
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

function emptyTechnicalSummary(): TechnicalSummary {
  return {
    decisions: [],
    architecture: [],
    libraries: [],
    problems: [],
    solutions: [],
    pending: [],
    nextSteps: [],
  }
}

function classifySection(value: string): keyof TechnicalSummary | null {
  const heading = compactWhitespace(stripMarkdown(value)).toLowerCase()
  if (/decisiones?/.test(heading)) return 'decisions'
  if (/arquitectura/.test(heading)) return 'architecture'
  if (/librer[ií]as?|dependencias?/.test(heading)) return 'libraries'
  if (/problemas?|errores?/.test(heading)) return 'problems'
  if (/pendientes?/.test(heading)) return 'pending'
  if (/pr[oó]ximos? pasos?/.test(heading)) return 'nextSteps'
  if (/soluciones?|implementaci[oó]n|comportamiento|correcciones?|cambios?/.test(heading)) {
    return 'solutions'
  }
  return null
}

function extractTechnicalSummary(text: string): TechnicalSummary {
  const result = emptyTechnicalSummary()
  let section: keyof TechnicalSummary | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const looksLikeHeading = /^#{1,6}\s+/.test(trimmed) || /^\*\*[^*]+\*\*:?$/.test(trimmed)
    if (looksLikeHeading) {
      section = classifySection(trimmed)
      continue
    }
    if (/^\|.*\|$/.test(trimmed) || /^[-:|\s]+$/.test(trimmed)) continue

    const isListItem = /^\s*(?:[-+•]|\d+[.)])\s+/.test(rawLine)
    if (!isListItem) continue

    const item = cleanContextItem(trimmed)
    if (!item) continue

    let target = section
    if (!target) {
      if (/\b(?:pendiente|falta|no se pudo|sin probar|requiere validar)\b/i.test(item)) {
        target = 'pending'
      } else if (/\b(?:error|fallo|problema)\b/i.test(item) && !/\b(?:corrig|solucion|evit|ya no)\w*/i.test(item)) {
        target = 'problems'
      } else {
        target = 'solutions'
      }
    }
    result[target].push(item)
  }

  for (const key of Object.keys(result) as Array<keyof TechnicalSummary>) {
    result[key] = uniqueItems(result[key])
  }
  return result
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
      .filter(
        (entry) =>
          !['.git', 'node_modules', 'vendor', 'dist', 'build'].includes(
            entry.name,
          ),
      )
      .slice(0, MAX_INVENTORY_ENTRIES)
      .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
  } catch {
    // The context fallback still works without an inventory.
  }
  const manifests = readManifestSummary(projectRoot)
  return [...entries, ...manifests].join('\n').slice(0, 24_000)
}

function localRecord(params: {
  request: string
  changedPaths: string[]
  runSummary: string
  forceInit: boolean
}): NormalizedContextRecord {
  const title = requestTitle(params.request, params.forceInit, params.changedPaths)
  const extracted = extractTechnicalSummary(params.runSummary)
  const solutions =
    extracted.solutions.length > 0
      ? extracted.solutions
      : [
          params.forceInit
            ? 'Se inicializó o actualizó la memoria persistente del proyecto.'
            : `Se implementó el cambio necesario para ${title.toLocaleLowerCase('es')}.`,
        ]

  return {
    title,
    objective: objectiveFromTitle(title),
    decisions: extracted.decisions,
    architecture: extracted.architecture,
    libraries: extracted.libraries,
    problems: extracted.problems,
    solutions: uniqueItems(solutions),
    pending: extracted.pending,
    nextSteps: extracted.nextSteps,
    masterSummary: truncateAtWord(objectiveFromTitle(title), MAX_ITEM_LENGTH),
  }
}

function normalizeOutput(
  output: ContextWriterOutput,
  params: {
    request: string
    changedPaths: string[]
    runSummary: string
    forceInit: boolean
  },
  fallback: NormalizedContextRecord,
): NormalizedContextRecord {
  // The local title is intentionally authoritative. It is deterministic,
  // bounded and cannot become a copy of a long conversational request.
  const title = requestTitle(params.request, params.forceInit, params.changedPaths)
  const normalizedSolutions = toStringArray(output.solutions)
  return {
    title,
    objective: safeString(output.objective, fallback.objective),
    decisions: toStringArray(output.decisions),
    architecture: toStringArray(output.architecture),
    libraries: toStringArray(output.libraries),
    problems: toStringArray(output.problems),
    solutions:
      normalizedSolutions.length > 0
        ? normalizedSolutions
        : fallback.solutions,
    pending: toStringArray(output.pending),
    nextSteps: toStringArray(output.nextSteps),
    masterSummary: truncateAtWord(
      safeString(output.masterSummary, fallback.masterSummary),
      MAX_ITEM_LENGTH,
    ),
  }
}

async function generateRecord(params: {
  client: CodebuffClient
  projectRoot: string
  request: string
  changedPaths: string[]
  runSummary: string
  forceInit: boolean
}): Promise<{ record: NormalizedContextRecord; usedFallback: boolean }> {
  const deterministicRecord = localRecord(params)

  // Normal implementation records are built locally from the request, changed
  // paths and concise technical bullets. This avoids an extra model call after
  // every turn and guarantees a useful fallback even when the provider is down.
  if (!params.forceInit) {
    return { record: deterministicRecord, usedFallback: false }
  }

  const prompt = [
    `Objetivo de inicialización:\n${deterministicRecord.objective}`,
    `Archivos conocidos:\n${params.changedPaths.join('\n') || '(ninguno informado)'}`,
    `Resultado técnico:\n${params.runSummary || '(sin resumen textual disponible)'}`,
    `Inventario del proyecto:\n${projectInventory(params.projectRoot) || '(no disponible)'}`,
  ].join('\n\n')

  try {
    const runState = await params.client.run({
      agent: CONTEXT_WRITER_AGENT,
      prompt,
      maxAgentSteps: 1,
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
          deterministicRecord,
        ),
        usedFallback: false,
      }
    }
  } catch (error) {
    logger.warn({ error }, '[contexto] Context initialization writer failed')
  }
  return { record: deterministicRecord, usedFallback: true }
}

function renderList(values: string[]): string {
  return values.map((value) => `- ${value}`).join('\n')
}

function renderOptionalSection(title: string, values: string[]): string {
  if (values.length === 0) return ''
  return `# ${title}\n\n${renderList(values)}\n\n`
}

function renderRecord(params: {
  number: number
  record: NormalizedContextRecord
  changedPaths: string[]
}): string {
  const prefix = String(params.number).padStart(3, '0')
  const changedPaths = uniqueItems(params.changedPaths.map(normalizePath))
  return `${AUTO_RECORD_MARKER}\n# ${prefix} — ${params.record.title}\n\n# Fecha\n\n${new Date().toISOString().slice(0, 10)}\n\n# Objetivo\n\n${params.record.objective}\n\n${renderOptionalSection('Decisiones tomadas', params.record.decisions)}${renderOptionalSection('Arquitectura actual', params.record.architecture)}${renderOptionalSection('Librerías usadas', params.record.libraries)}# Archivos importantes modificados\n\n${renderList(changedPaths)}\n\n${renderOptionalSection('Problemas encontrados', params.record.problems)}# Soluciones implementadas\n\n${renderList(params.record.solutions)}\n\n${renderOptionalSection('Pendientes', params.record.pending)}${renderOptionalSection('Próximos pasos', params.record.nextSteps)}`
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
    if (next === current) {
      return {
        relativePath: 'contexto/000-contexto-maestro.md',
        changed: false,
      }
    }
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
  const changedPaths = [
    ...new Set([...params.changedPaths].map(normalizePath)),
  ].sort()
  const existingContextPaths = changedPaths.filter(contextPath)
  const existingNumberedRecords = existingContextPaths.filter(
    (entry) => !/^contexto\/0+(?:[-_]|contexto-maestro)/i.test(entry),
  )
  const nonContextPaths = changedPaths.filter((entry) => !contextPath(entry))
  const forceInit = params.forceInit === true

  if (!forceInit && nonContextPaths.length === 0) {
    return {
      paths: existingContextPaths,
      createdRecord: false,
      usedFallback: false,
    }
  }

  const contextDir = path.join(path.resolve(params.projectRoot), 'contexto')
  fs.mkdirSync(contextDir, { recursive: true })
  const runSummary = summarizeRunState(params.runState)
  const documentedPaths =
    nonContextPaths.length > 0 ? nonContextPaths : existingContextPaths
  const { record, usedFallback } = await generateRecord({
    client: params.client,
    projectRoot: params.projectRoot,
    request: params.request,
    changedPaths: documentedPaths,
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
      renderRecord({
        number: nextNumber,
        record,
        changedPaths: documentedPaths,
      }),
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
    changedPaths: documentedPaths,
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
