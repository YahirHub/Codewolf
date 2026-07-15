import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { findGitRoot } from './git'

import type { AgentDefinition, CodebuffClient } from '@codebuff/sdk'

const execFileAsync = promisify(execFile)
const MAX_DIFF_CHARS = 160_000
const MAX_UNTRACKED_FILE_CHARS = 20_000

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
  paths: string[]
  skippedPreexistingPaths: string[]
  fingerprints: Record<string, FileFingerprint>
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
  systemPrompt: `Write professional Git commit messages in Spanish from a verified code diff. Never mention AI, assistants, prompts, models, ChatGPT, OpenAI or Codewolf. The summary must be concrete, under 72 characters and without a trailing period. The description must explain what changed and why, not testing instructions or marketing language. Return only the structured output.`,
  instructionsPrompt:
    'Base the commit message only on the supplied request, paths, status and diff. Do not invent changes.',
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

function parsePorcelainZ(output: string): string[] {
  const entries = output.split('\0').filter(Boolean)
  const paths: string[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''
    if (entry.length < 4) continue
    const status = entry.slice(0, 2)
    const filePath = entry.slice(3)
    if (filePath) paths.push(normalizeGitPath(filePath))
    if (status.includes('R') || status.includes('C')) {
      const sourcePath = entries[index + 1]
      if (sourcePath) {
        paths.push(normalizeGitPath(sourcePath))
        index += 1
      }
    }
  }
  return paths
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
}): { paths: string[]; skippedPreexistingPaths: string[] } {
  const projectRoot = path.resolve(params.projectRoot)
  const paths = new Set<string>()
  const skipped = new Set<string>()

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
    if (params.baseline.dirtyPaths.has(gitRelative)) {
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

function sanitizeSummary(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const withoutPrefix = raw
    .replace(/^summary\s*:\s*/i, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
  if (!withoutPrefix || FORBIDDEN_COMMIT_REFERENCE.test(withoutPrefix)) {
    return 'Guardar cambios verificados'
  }
  return withoutPrefix.slice(0, 72).trimEnd()
}

function sanitizeDescription(value: unknown, paths: string[]): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw) {
    const withoutPrefix = raw.replace(/^description\s*:\s*/i, '')
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
  return `Incluye los cambios verificados en ${paths.length} archivo${paths.length === 1 ? '' : 's'}: ${paths.join(', ')}.`
}

async function collectDiffContext(
  pending: PendingVerifiedCommit,
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
  client: CodebuffClient
}): Promise<{ summary: string; description: string }> {
  const context = await collectDiffContext(params.pending)
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
        summary: sanitizeSummary(output.summary),
        description: sanitizeDescription(
          output.description,
          params.pending.paths,
        ),
      }
    }
  } catch {
    // A model failure must not make the verified local workflow unusable.
  }

  return {
    summary: 'Guardar cambios verificados',
    description: sanitizeDescription(undefined, params.pending.paths),
  }
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
  client: CodebuffClient
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
  return {
    hash: hash.trim(),
    summary: message.summary,
    description: message.description,
    paths: pending.paths,
  }
}

export const __verifiedCommitInternals = {
  parsePorcelainZ,
  sanitizeSummary,
  sanitizeDescription,
  normalizeGitPath,
  filterPathsByPorcelain,
}
