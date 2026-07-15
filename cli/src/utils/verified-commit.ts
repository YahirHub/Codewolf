import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { getProjectDataDirForRoot } from '../project-files'
import { findGitRoot } from './git'

import type { AgentDefinition, CodebuffClient } from '@codebuff/sdk'

const execFileAsync = promisify(execFile)
const MAX_DIFF_CHARS = 160_000
const MAX_UNTRACKED_FILE_CHARS = 20_000
const VERIFIED_COMMIT_BACKLOG_VERSION = 1

export type FileFingerprint = {
  exists: boolean
  sha256: string | null
}

export type GitVerificationBaseline = {
  gitRoot: string
  dirtyPaths: Set<string>
}

export type PendingVerifiedCommit = {
  projectRoot: string
  gitRoot: string
  request: string
  requests?: string[]
  paths: string[]
  deferredPaths?: string[]
  skippedPreexistingPaths: string[]
  fingerprints: Record<string, FileFingerprint>
}

type StoredVerifiedCommitBacklog = {
  version: 1
  projectRoot: string
  gitRoot: string
  requests: string[]
  paths: string[]
  fingerprints: Record<string, FileFingerprint>
  updatedAt: string
}

export type LoadedVerifiedCommitBacklog = {
  paths: string[]
  requests: string[]
  fingerprints: Record<string, FileFingerprint>
  skippedChangedPaths: string[]
}

export type VerifiedCommitResult = {
  hash: string
  summary: string
  description: string
  paths: string[]
}

type CommitMessageOutput = {
  summary?: unknown
  description?: unknown
}

type GitChangeKind =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked'

type GitChangeEntry = {
  path: string
  sourcePath?: string
  status: string
  kind: GitChangeKind
}

type LocalCommitMessageFacts = {
  request: string
  paths: string[]
  changes: GitChangeEntry[]
  markdownTitles: Record<string, string>
}

const COMMIT_MESSAGE_AGENT: AgentDefinition = {
  id: 'codewolf-commit-message',
  displayName: 'Commit Message Writer',
  model: 'anthropic/claude-sonnet-4.6',
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Spanish commit summary, imperative or present tense, no more than 72 characters.',
      },
      description: {
        type: 'string',
        description:
          'Spanish technical commit description explaining the verified behavior and important implementation details.',
      },
    },
    required: ['summary', 'description'],
  },
  includeMessageHistory: false,
  spawnableAgents: [],
  toolNames: [],
  systemPrompt: `Write professional Git commit messages in Spanish from a verified code diff. Describe the semantic work that was performed, never the mechanical act of saving, staging or verifying files. Never use generic summaries such as "Guardar cambios verificados", "Actualizar cambios" or "Aplicar cambios". When the diff mainly creates or updates contexto/*.md and knowledge files, say that the project context was created or updated. Never mention AI, assistants, prompts, models, ChatGPT, OpenAI or Codewolf. The summary must be concrete, under 72 characters and without a trailing period. The description must explain what changed and why, not testing instructions or marketing language. Return only the structured output.`,
  instructionsPrompt:
    'Base the commit message only on the supplied request, local semantic draft, paths, status and diff. Prefer the actual diff over the original request and do not invent changes.',
}

async function runGit(
  gitRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', ['-C', gitRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr || '')
        : ''
    throw new Error(
      message.trim() ||
        (error instanceof Error ? error.message : 'Git devolvió un error'),
    )
  }
}

function normalizeGitPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function resolveGitChangeKind(status: string): GitChangeKind {
  if (status.includes('?')) return 'untracked'
  if (status.includes('R')) return 'renamed'
  if (status.includes('C')) return 'copied'
  if (status.includes('A')) return 'added'
  if (status.includes('D')) return 'deleted'
  return 'modified'
}

function parsePorcelainEntries(output: string): GitChangeEntry[] {
  const records = output.split('\0').filter(Boolean)
  const changes: GitChangeEntry[] = []

  for (let index = 0; index < records.length; index++) {
    const record = records[index] ?? ''
    if (record.length < 4) continue

    const status = record.slice(0, 2)
    const filePath = normalizeGitPath(record.slice(3))
    if (!filePath) continue

    const change: GitChangeEntry = {
      path: filePath,
      status,
      kind: resolveGitChangeKind(status),
    }

    if (status.includes('R') || status.includes('C')) {
      const sourcePath = records[index + 1]
      if (sourcePath) {
        change.sourcePath = normalizeGitPath(sourcePath)
        index += 1
      }
    }

    changes.push(change)
  }

  return changes
}

function parsePorcelainZ(output: string): string[] {
  return parsePorcelainEntries(output).flatMap((change) => [
    change.path,
    ...(change.sourcePath ? [change.sourcePath] : []),
  ])
}

function toGitRelativePath(
  gitRoot: string,
  absolutePath: string,
): string | null {
  const relative = path.relative(gitRoot, absolutePath)
  if (!relative || relative === '.') return null
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return normalizeGitPath(relative)
}

export async function listGitWorkingTreePaths(
  gitRoot: string,
): Promise<string[]> {
  const { stdout } = await runGit(gitRoot, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ])
  return [...new Set(parsePorcelainZ(stdout))].sort()
}

export async function captureGitVerificationBaseline(
  projectRoot: string,
): Promise<GitVerificationBaseline | null> {
  const gitRoot = findGitRoot({ cwd: projectRoot })
  if (!gitRoot) return null

  const { stdout } = await runGit(gitRoot, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ])
  return {
    gitRoot,
    dirtyPaths: new Set(parsePorcelainZ(stdout)),
  }
}

export function selectVerifiedCommitPaths(params: {
  projectRoot: string
  baseline: GitVerificationBaseline
  mutatedPaths: Iterable<string>
  allowedPreexistingPaths?: Iterable<string>
}): { paths: string[]; skippedPreexistingPaths: string[] } {
  const projectRoot = path.resolve(params.projectRoot)
  const paths = new Set<string>()
  const skipped = new Set<string>()
  const allowedPreexistingPaths = new Set(
    [...(params.allowedPreexistingPaths ?? [])].map(normalizeGitPath),
  )

  for (const mutationPath of params.mutatedPaths) {
    const absolutePath = path.resolve(projectRoot, mutationPath)
    const projectRelative = path.relative(projectRoot, absolutePath)
    if (
      projectRelative.startsWith('..') ||
      path.isAbsolute(projectRelative) ||
      projectRelative === ''
    ) {
      continue
    }
    const gitRelative = toGitRelativePath(params.baseline.gitRoot, absolutePath)
    if (!gitRelative) continue
    if (
      params.baseline.dirtyPaths.has(gitRelative) &&
      !allowedPreexistingPaths.has(gitRelative)
    ) {
      skipped.add(gitRelative)
    } else {
      paths.add(gitRelative)
    }
  }

  return {
    paths: [...paths].sort(),
    skippedPreexistingPaths: [...skipped].sort(),
  }
}

function filterPathsByPorcelain(
  paths: string[],
  porcelainOutput: string,
): string[] {
  const changedPaths = new Set(parsePorcelainZ(porcelainOutput))
  return paths
    .map(normalizeGitPath)
    .filter((gitPath) => changedPaths.has(gitPath))
}

export async function filterVerifiedCommitPathsWithChanges(params: {
  gitRoot: string
  paths: string[]
}): Promise<string[]> {
  if (params.paths.length === 0) return []
  const { stdout } = await runGit(params.gitRoot, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    ...params.paths,
  ])
  return filterPathsByPorcelain(params.paths, stdout)
}

function fingerprintAbsolutePath(absolutePath: string): FileFingerprint {
  try {
    const stat = fs.statSync(absolutePath)
    if (!stat.isFile()) return { exists: false, sha256: null }
    const hash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(absolutePath))
      .digest('hex')
    return { exists: true, sha256: hash }
  } catch {
    return { exists: false, sha256: null }
  }
}

export function captureVerifiedCommitFingerprints(params: {
  gitRoot: string
  paths: string[]
}): Record<string, FileFingerprint> {
  return Object.fromEntries(
    params.paths.map((gitPath) => [
      gitPath,
      fingerprintAbsolutePath(path.join(params.gitRoot, gitPath)),
    ]),
  )
}

function verifiedCommitBacklogPath(projectRoot: string): string {
  return path.join(
    getProjectDataDirForRoot(projectRoot),
    'verified-commit-backlog.json',
  )
}

function normalizeRequests(requests: unknown): string[] {
  if (!Array.isArray(requests)) return []
  return requests
    .filter((request): request is string => typeof request === 'string')
    .map((request) => request.trim())
    .filter(Boolean)
    .slice(-50)
}

function safeReadVerifiedCommitBacklog(
  projectRoot: string,
): StoredVerifiedCommitBacklog | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(verifiedCommitBacklogPath(projectRoot), 'utf8'),
    ) as Partial<StoredVerifiedCommitBacklog>
    if (
      parsed.version !== VERIFIED_COMMIT_BACKLOG_VERSION ||
      typeof parsed.projectRoot !== 'string' ||
      typeof parsed.gitRoot !== 'string' ||
      !Array.isArray(parsed.paths) ||
      !parsed.fingerprints ||
      typeof parsed.fingerprints !== 'object'
    ) {
      return null
    }
    return {
      version: VERIFIED_COMMIT_BACKLOG_VERSION,
      projectRoot: path.resolve(parsed.projectRoot),
      gitRoot: path.resolve(parsed.gitRoot),
      requests: normalizeRequests(parsed.requests),
      paths: parsed.paths
        .filter((entry): entry is string => typeof entry === 'string')
        .map(normalizeGitPath),
      fingerprints: parsed.fingerprints as Record<string, FileFingerprint>,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

export function saveVerifiedCommitBacklog(
  pending: PendingVerifiedCommit,
): void {
  const target = verifiedCommitBacklogPath(pending.projectRoot)
  const stored: StoredVerifiedCommitBacklog = {
    version: VERIFIED_COMMIT_BACKLOG_VERSION,
    projectRoot: path.resolve(pending.projectRoot),
    gitRoot: path.resolve(pending.gitRoot),
    requests: normalizeRequests(pending.requests ?? [pending.request]),
    paths: [...new Set(pending.paths.map(normalizeGitPath))].sort(),
    fingerprints: pending.fingerprints,
    updatedAt: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(stored, null, 2))
  fs.renameSync(temporary, target)
}

export function clearVerifiedCommitBacklog(projectRoot: string): void {
  try {
    fs.rmSync(verifiedCommitBacklogPath(projectRoot), { force: true })
  } catch {
    // Best effort: a stale backlog is reconciled against Git on the next turn.
  }
}

export async function loadVerifiedCommitBacklog(params: {
  projectRoot: string
  gitRoot: string
}): Promise<LoadedVerifiedCommitBacklog> {
  const empty: LoadedVerifiedCommitBacklog = {
    paths: [],
    requests: [],
    fingerprints: {},
    skippedChangedPaths: [],
  }
  const stored = safeReadVerifiedCommitBacklog(params.projectRoot)
  if (
    !stored ||
    path.resolve(stored.projectRoot) !== path.resolve(params.projectRoot) ||
    path.resolve(stored.gitRoot) !== path.resolve(params.gitRoot)
  ) {
    if (stored) clearVerifiedCommitBacklog(params.projectRoot)
    return empty
  }

  const stillChanged = new Set(
    await filterVerifiedCommitPathsWithChanges({
      gitRoot: params.gitRoot,
      paths: stored.paths,
    }),
  )
  const safePaths: string[] = []
  const skippedChangedPaths: string[] = []
  const fingerprints: Record<string, FileFingerprint> = {}

  for (const gitPath of stored.paths) {
    if (!stillChanged.has(gitPath)) continue
    const expected = stored.fingerprints[gitPath]
    const current = fingerprintAbsolutePath(path.join(params.gitRoot, gitPath))
    if (
      !expected ||
      expected.exists !== current.exists ||
      expected.sha256 !== current.sha256
    ) {
      skippedChangedPaths.push(gitPath)
      continue
    }
    safePaths.push(gitPath)
    fingerprints[gitPath] = current
  }

  if (safePaths.length === 0) {
    clearVerifiedCommitBacklog(params.projectRoot)
    return { ...empty, skippedChangedPaths }
  }

  const loaded: LoadedVerifiedCommitBacklog = {
    paths: safePaths.sort(),
    requests: stored.requests,
    fingerprints,
    skippedChangedPaths: skippedChangedPaths.sort(),
  }
  saveVerifiedCommitBacklog({
    projectRoot: params.projectRoot,
    gitRoot: params.gitRoot,
    request: stored.requests.at(-1) ?? '',
    requests: stored.requests,
    paths: loaded.paths,
    skippedPreexistingPaths: loaded.skippedChangedPaths,
    fingerprints: loaded.fingerprints,
  })
  return loaded
}

function assertFingerprintsUnchanged(pending: PendingVerifiedCommit): void {
  const changed: string[] = []
  for (const gitPath of pending.paths) {
    const expected = pending.fingerprints[gitPath]
    const current = fingerprintAbsolutePath(path.join(pending.gitRoot, gitPath))
    if (
      !expected ||
      expected.exists !== current.exists ||
      expected.sha256 !== current.sha256
    ) {
      changed.push(gitPath)
    }
  }
  if (changed.length > 0) {
    throw new Error(
      `Estos archivos cambiaron después de la implementación y no se incluirán automáticamente: ${changed.join(', ')}. Vuelve a verificar los cambios.`,
    )
  }
}

const FORBIDDEN_COMMIT_REFERENCE =
  /\b(ChatGPT|OpenAI|IA|inteligencia artificial|asistente(?:s)?)\b/i

const GENERIC_COMMIT_SUMMARY =
  /^(guardar cambios verificados|guardar cambios|actualizar cambios|aplicar cambios|realizar cambios|confirmar cambios|cambios verificados)$/i

const GENERIC_COMMIT_DESCRIPTION =
  /^(?:incluye|guarda|confirma|aplica|actualiza)\s+(?:los\s+)?cambios(?:\s+verificados|\s+realizados)?\b/i

function formatPathList(paths: string[], limit = 4): string {
  if (paths.length <= limit) return paths.join(', ')
  return `${paths.slice(0, limit).join(', ')} y ${paths.length - limit} más`
}

function isContextKnowledgePath(gitPath: string): boolean {
  const normalized = normalizeGitPath(gitPath)
  return (
    /^contexto\/.*\.md$/i.test(normalized) ||
    /(^|\/)(?:knowledge|agents|claude)\.md$/i.test(normalized)
  )
}

function isDocumentationPath(gitPath: string): boolean {
  const normalized = normalizeGitPath(gitPath)
  return (
    isContextKnowledgePath(normalized) ||
    /(^|\/)(?:readme|contributing|security|changelog)(?:\.[^/]+)?$/i.test(
      normalized,
    ) ||
    /^docs\//i.test(normalized) ||
    /\.md$/i.test(normalized)
  )
}

function normalizeMarkdownTitle(value: string): string {
  return value
    .replace(/^\s*#+\s*/, '')
    .replace(/^\d+\s*[—–:-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readMarkdownTitle(absolutePath: string): string | undefined {
  try {
    const content = fs.readFileSync(absolutePath, 'utf8').slice(0, 8_000)
    for (const line of content.split(/\r?\n/)) {
      if (!/^\s*#\s+/.test(line)) continue
      const title = normalizeMarkdownTitle(line)
      if (title) return title
    }
  } catch {
    // Binary/deleted files simply have no semantic title.
  }
  return undefined
}

function deriveSummaryFromRequest(request: string): string | undefined {
  const firstMeaningfulLine = request
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 4)
  if (!firstMeaningfulLine) return undefined

  const normalized = firstMeaningfulLine
    .replace(/^[-*\d.)\s]+/, '')
    .replace(
      /^(?:ahora\s+)?(?:quiero\s+que|necesito\s+que|por\s+favor)\s+/i,
      '',
    )
    .replace(/^(?:puedes|podrías)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || /^(contin[uú]a|sigue|hazlo)$/i.test(normalized)) {
    return undefined
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function buildLocalCommitMessage(facts: LocalCommitMessageFacts): {
  summary: string
  description: string
} {
  const changesByPath = new Map(
    facts.changes.map((change) => [normalizeGitPath(change.path), change]),
  )
  const addedPaths = facts.paths.filter((gitPath) => {
    const kind = changesByPath.get(normalizeGitPath(gitPath))?.kind
    return kind === 'added' || kind === 'untracked' || kind === 'copied'
  })
  const deletedPaths = facts.paths.filter(
    (gitPath) =>
      changesByPath.get(normalizeGitPath(gitPath))?.kind === 'deleted',
  )
  const updatedPaths = facts.paths.filter(
    (gitPath) =>
      !addedPaths.includes(gitPath) && !deletedPaths.includes(gitPath),
  )
  const allContextKnowledge =
    facts.paths.length > 0 && facts.paths.every(isContextKnowledgePath)

  if (allContextKnowledge) {
    const addedContextPaths = addedPaths.filter((gitPath) =>
      /^contexto\/.*\.md$/i.test(normalizeGitPath(gitPath)),
    )
    const summary =
      addedContextPaths.length > 0
        ? 'Crear archivos de contexto del proyecto'
        : 'Actualizar contexto persistente del proyecto'

    const titles = addedContextPaths
      .map((gitPath) => facts.markdownTitles[gitPath])
      .filter((title): title is string => Boolean(title))
    const sentences: string[] = []
    if (addedContextPaths.length > 0) {
      sentences.push(
        `Crea ${formatPathList(addedContextPaths)}${
          titles.length > 0
            ? ` para documentar ${titles.join(' y ')}`
            : ' para conservar las decisiones y el estado técnico del proyecto'
        }.`,
      )
    }
    if (updatedPaths.length > 0) {
      sentences.push(
        `Actualiza ${formatPathList(updatedPaths)} para mantener la memoria persistente alineada con el estado actual.`,
      )
    }
    if (deletedPaths.length > 0) {
      sentences.push(
        `Retira ${formatPathList(deletedPaths)} porque ya no representa el contexto vigente.`,
      )
    }

    return {
      summary,
      description:
        sentences.join(' ') ||
        'Actualiza la memoria técnica persistente del proyecto con las decisiones y pendientes vigentes.',
    }
  }

  const allDocumentation =
    facts.paths.length > 0 && facts.paths.every(isDocumentationPath)
  if (allDocumentation) {
    return {
      summary:
        addedPaths.length > 0
          ? 'Agregar documentación del proyecto'
          : 'Actualizar documentación del proyecto',
      description: `${
        addedPaths.length > 0
          ? `Agrega ${formatPathList(addedPaths)}`
          : `Actualiza ${formatPathList(updatedPaths)}`
      } para documentar el comportamiento, las decisiones y el uso actual del proyecto.`,
    }
  }

  const requestSummary = deriveSummaryFromRequest(facts.request)
  const commonTopLevel = (() => {
    const roots = new Set(
      facts.paths.map((gitPath) => normalizeGitPath(gitPath).split('/')[0]),
    )
    return roots.size === 1 ? [...roots][0] : undefined
  })()
  const summary = requestSummary
    ? requestSummary
    : commonTopLevel
      ? `Actualizar ${commonTopLevel}`
      : 'Actualizar implementación del proyecto'

  const operations = [
    addedPaths.length > 0 ? `agrega ${formatPathList(addedPaths)}` : undefined,
    updatedPaths.length > 0
      ? `actualiza ${formatPathList(updatedPaths)}`
      : undefined,
    deletedPaths.length > 0
      ? `elimina ${formatPathList(deletedPaths)}`
      : undefined,
  ].filter((part): part is string => Boolean(part))

  return {
    summary,
    description:
      operations.length > 0
        ? `${operations.join('; ')} para completar la solicitud verificada sin incluir cambios ajenos al turno.`
        : `Actualiza ${formatPathList(facts.paths)} para completar la solicitud verificada.`,
  }
}

function sanitizeSummary(
  value: unknown,
  fallback = 'Guardar cambios verificados',
): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const withoutPrefix = raw
    .replace(/^summary\s*:\s*/i, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
  if (
    !withoutPrefix ||
    FORBIDDEN_COMMIT_REFERENCE.test(withoutPrefix) ||
    GENERIC_COMMIT_SUMMARY.test(withoutPrefix)
  ) {
    return fallback.slice(0, 72).trimEnd()
  }
  return withoutPrefix.slice(0, 72).trimEnd()
}

function sanitizeDescription(
  value: unknown,
  paths: string[],
  fallback = `Incluye los cambios verificados en ${paths.length} archivo${
    paths.length === 1 ? '' : 's'
  }: ${paths.join(', ')}.`,
): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw) {
    const withoutPrefix = raw.replace(/^description\s*:\s*/i, '')
    if (GENERIC_COMMIT_DESCRIPTION.test(withoutPrefix)) {
      return fallback.slice(0, 3000)
    }
    const sanitized = withoutPrefix
      .split(/(?<=[.!?])\s+|\r?\n/)
      .map((sentence) => sentence.trim())
      .filter(
        (sentence) =>
          sentence.length > 0 && !FORBIDDEN_COMMIT_REFERENCE.test(sentence),
      )
      .join(' ')
      .replace(/\s+([.,;:])/g, '$1')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, 3000)
    if (sanitized) return sanitized
  }
  return fallback.slice(0, 3000)
}

async function collectLocalCommitMessageFacts(
  pending: PendingVerifiedCommit,
): Promise<LocalCommitMessageFacts> {
  const { stdout } = await runGit(pending.gitRoot, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    ...pending.paths,
  ])
  const changes = parsePorcelainEntries(stdout)
  const markdownTitles = Object.fromEntries(
    pending.paths.flatMap((gitPath) => {
      if (!/\.md$/i.test(gitPath)) return []
      const title = readMarkdownTitle(path.join(pending.gitRoot, gitPath))
      return title ? [[gitPath, title] as const] : []
    }),
  )

  return {
    request: (pending.requests?.length ? pending.requests : [pending.request]).join(
      '\n\n--- Solicitud acumulada ---\n\n',
    ),
    paths: pending.paths,
    changes,
    markdownTitles,
  }
}

async function collectDiffContext(
  pending: PendingVerifiedCommit,
  localMessage: { summary: string; description: string },
): Promise<string> {
  const pathArgs = ['--', ...pending.paths]
  const [status, stat, diff] = await Promise.all([
    runGit(pending.gitRoot, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      ...pathArgs,
    ]),
    runGit(pending.gitRoot, ['diff', '--stat', ...pathArgs]),
    runGit(pending.gitRoot, [
      'diff',
      '--no-ext-diff',
      '--unified=2',
      ...pathArgs,
    ]),
  ])

  const untracked = status.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('?? '))
    .map((line) => normalizeGitPath(line.slice(3)))
  const untrackedSections: string[] = []
  for (const gitPath of untracked) {
    try {
      const content = fs.readFileSync(
        path.join(pending.gitRoot, gitPath),
        'utf8',
      )
      untrackedSections.push(
        `\n### Archivo nuevo: ${gitPath}\n${content.slice(0, MAX_UNTRACKED_FILE_CHARS)}`,
      )
    } catch {
      untrackedSections.push(
        `\n### Archivo nuevo binario o ilegible: ${gitPath}`,
      )
    }
  }

  return [
    `Solicitud original:\n${pending.request.slice(0, 4000)}`,
    `Borrador semántico local:\nSummary: ${localMessage.summary}\nDescription: ${localMessage.description}`,
    `Archivos verificados:\n${pending.paths.join('\n')}`,
    `Estado:\n${status.stdout || '(sin salida)'}`,
    `Resumen del diff:\n${stat.stdout || '(sin salida)'}`,
    `Diff:\n${diff.stdout}${untrackedSections.join('\n')}`,
  ]
    .join('\n\n')
    .slice(0, MAX_DIFF_CHARS)
}

async function generateCommitMessage(params: {
  pending: PendingVerifiedCommit
  client?: CodebuffClient
}): Promise<{ summary: string; description: string }> {
  const facts = await collectLocalCommitMessageFacts(params.pending)
  const localMessage = buildLocalCommitMessage(facts)
  const safeLocalMessage = {
    summary: sanitizeSummary(localMessage.summary, 'Actualizar proyecto'),
    description: sanitizeDescription(
      localMessage.description,
      params.pending.paths,
      'Actualiza los archivos verificados según el cambio implementado.',
    ),
  }

  if (!params.client) return safeLocalMessage

  const context = await collectDiffContext(params.pending, safeLocalMessage)
  try {
    const result = await params.client.run({
      agent: COMMIT_MESSAGE_AGENT,
      prompt: context,
      maxAgentSteps: 2,
    })
    if (
      result.output.type === 'structuredOutput' &&
      result.output.value &&
      typeof result.output.value === 'object'
    ) {
      const output = result.output.value as CommitMessageOutput
      return {
        summary: sanitizeSummary(output.summary, safeLocalMessage.summary),
        description: sanitizeDescription(
          output.description,
          params.pending.paths,
          safeLocalMessage.description,
        ),
      }
    }
  } catch {
    // The local semantic message is complete enough to commit even when the
    // provider is temporarily unavailable.
  }

  return safeLocalMessage
}

async function ensureNoStagedChanges(gitRoot: string): Promise<void> {
  const { stdout } = await runGit(gitRoot, ['diff', '--cached', '--name-only'])
  if (stdout.trim()) {
    throw new Error(
      'Ya existen cambios preparados en Git. Confírmalos o quítalos del staging antes de usar el commit automático para evitar mezclarlos.',
    )
  }
}

async function assertOnlyPendingPathsStaged(
  gitRoot: string,
  expectedPaths: string[],
): Promise<void> {
  const { stdout } = await runGit(gitRoot, [
    'diff',
    '--cached',
    '--name-only',
    '-z',
  ])
  const staged = new Set(
    stdout.split('\0').filter(Boolean).map(normalizeGitPath),
  )
  const expected = new Set(expectedPaths.map(normalizeGitPath))
  const unexpected = [...staged].filter((gitPath) => !expected.has(gitPath))
  const missing = [...expected].filter((gitPath) => !staged.has(gitPath))
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      [
        unexpected.length > 0
          ? `Git preparó archivos ajenos al turno: ${unexpected.join(', ')}`
          : '',
        missing.length > 0
          ? `No se pudieron preparar estos archivos verificados: ${missing.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('. '),
    )
  }
}

async function unstagePaths(gitRoot: string, paths: string[]): Promise<void> {
  try {
    await runGit(gitRoot, ['restore', '--staged', '--', ...paths])
  } catch {
    try {
      await runGit(gitRoot, ['reset', '--quiet', 'HEAD', '--', ...paths])
    } catch {
      // Best effort only. The error that caused the commit failure is preserved.
    }
  }
}

export async function createVerifiedCommit(params: {
  pending: PendingVerifiedCommit
  client?: CodebuffClient
}): Promise<VerifiedCommitResult> {
  const { pending } = params
  if (pending.paths.length === 0) {
    throw new Error('No hay archivos elegibles para confirmar.')
  }
  const currentGitRoot = findGitRoot({ cwd: pending.projectRoot })
  if (
    !currentGitRoot ||
    path.resolve(currentGitRoot) !== path.resolve(pending.gitRoot)
  ) {
    throw new Error(
      'El repositorio Git ya no coincide con el proyecto verificado. Abre nuevamente el proyecto antes de confirmar.',
    )
  }

  assertFingerprintsUnchanged(pending)
  await ensureNoStagedChanges(pending.gitRoot)

  const { stdout: status } = await runGit(pending.gitRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...pending.paths,
  ])
  if (!status.trim()) {
    throw new Error(
      'Los archivos verificados ya no contienen cambios pendientes.',
    )
  }

  const message = await generateCommitMessage({
    pending,
    client: params.client,
  })

  // Message generation may take several seconds. Revalidate immediately before
  // staging so edits made while the model was writing the commit message are
  // never included under an earlier user confirmation.
  assertFingerprintsUnchanged(pending)
  await ensureNoStagedChanges(pending.gitRoot)
  await runGit(pending.gitRoot, ['add', '-A', '--', ...pending.paths])

  try {
    await assertOnlyPendingPathsStaged(pending.gitRoot, pending.paths)
    await runGit(pending.gitRoot, [
      'commit',
      '-m',
      message.summary,
      '-m',
      message.description,
    ])
  } catch (error) {
    await unstagePaths(pending.gitRoot, pending.paths)
    throw error
  }

  const { stdout: hash } = await runGit(pending.gitRoot, [
    'rev-parse',
    '--short',
    'HEAD',
  ])
  clearVerifiedCommitBacklog(pending.projectRoot)
  return {
    hash: hash.trim(),
    summary: message.summary,
    description: message.description,
    paths: pending.paths,
  }
}

export const __verifiedCommitInternals = {
  parsePorcelainZ,
  parsePorcelainEntries,
  sanitizeSummary,
  sanitizeDescription,
  normalizeGitPath,
  filterPathsByPorcelain,
  buildLocalCommitMessage,
}
