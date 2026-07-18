/// <reference path="../types/adm-zip.d.ts" />
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import posixPath from 'node:path/posix'
import type { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import AdmZip from 'adm-zip'
import createIgnore from 'ignore'

import type {
  GitzipAction,
  GitzipFormat,
} from '@codebuff/common/tools/params/tool/gitzip'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import { normalizeJsonValue } from '@codebuff/common/util/json'
import { isProtectedEnvFilePath } from '@codebuff/common/util/protected-env'

import { getPersistentSshManager, resolveRemotePath } from './ssh-remote'

import type {
  PersistentSshManager,
  SshRemoteExecutionContext,
} from './ssh-remote'

const IGNORE_FILENAMES = [
  '.gitignore',
  '.codewolfignore',
  '.codebuffignore',
  '.manicodeignore',
] as const
const ZERO_BLOCK = Buffer.alloc(512)
const SAFE_TAR_ARGUMENT =
  /^(?:--numeric-owner|--(?:no-)?xattrs|--(?:no-)?acls|--(?:no-)?selinux|--sparse|--ignore-failed-read|--hard-dereference|--dereference|--format=(?:gnu|pax|posix|ustar)|--sort=(?:name|none)|--owner=[0-9]+|--group=[0-9]+|--mode=[A-Za-z0-9,+\-=]+|--mtime=[^\r\n\0]+|--warning=[A-Za-z0-9_-]+)$/
const SAFE_ZIP_ARGUMENT = /^(?:-[0-9]|-X|-y|-q|-v)$/

export type GitzipInput = {
  action: GitzipAction
  source_path?: string
  output_path?: string
  format?: GitzipFormat
  connection_id?: string
  remote_path?: string
  extract_remote?: boolean
  extract_path?: string
  cleanup_local?: boolean
  cleanup_remote_archive?: boolean
  extra_excludes?: string[]
  include_protected_env?: boolean
  overwrite?: boolean
  compression_level?: number
  archive_args?: string[]
  timeout_seconds?: number
  reason?: string
}

export type GitzipExecutionContext = SshRemoteExecutionContext & {
  sshManager?: PersistentSshManager
}

type EntryType = 'file' | 'directory' | 'symlink'

type ArchiveEntry = {
  relativePath: string
  absolutePath: string
  type: EntryType
  size: number
  mode: number
  mtime: Date
  linkTarget?: string
}

type ArchiveManifest = {
  entries: ArchiveEntry[]
  files: number
  directories: number
  symlinks: number
  bytes: number
  ignored: number
  protectedEnvExcluded: number
}

type RemoteEntry = {
  name: string
  size: number
  mode: number
  modified_at?: string
  type: EntryType
}

type RemoteManifest = {
  sourceRoot: string
  paths: string[]
  files: number
  directories: number
  symlinks: number
  bytes: number
  ignored: number
  protectedEnvExcluded: number
}

export function isGitzipRemoteAction(action: GitzipAction): boolean {
  return (
    action === 'upload' ||
    action === 'remote_create' ||
    action === 'remote_extract'
  )
}

function json(value: Record<string, unknown>): ToolResultOutput[] {
  return [{ type: 'json', value: normalizeJsonValue(value) }]
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function localSourcePath(
  projectRoot: string | undefined,
  value: string,
): string {
  const expanded = expandHome(value)
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(projectRoot ?? process.cwd(), expanded)
}

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function archiveExtension(format: GitzipFormat): string {
  return format === 'tar.gz' ? 'tar.gz' : format
}

function inferFormat(
  explicit: GitzipFormat | undefined,
  outputPath: string | undefined,
  fallback: GitzipFormat,
): GitzipFormat {
  if (explicit) return explicit
  const lower = outputPath?.toLowerCase()
  if (lower?.endsWith('.tar.gz') || lower?.endsWith('.tgz')) return 'tar.gz'
  if (lower?.endsWith('.tar')) return 'tar'
  if (lower?.endsWith('.zip')) return 'zip'
  return fallback
}

function defaultArchiveName(sourcePath: string, format: GitzipFormat): string {
  const name = path.basename(path.resolve(sourcePath)) || 'project'
  return `${name}.${archiveExtension(format)}`
}

function resolveLocalOutput(
  sourceRoot: string,
  requested: string | undefined,
  format: GitzipFormat,
): string {
  if (!requested)
    return path.join(sourceRoot, defaultArchiveName(sourceRoot, format))
  const expanded = expandHome(requested)
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(sourceRoot, expanded)
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

function rebaseGitignorePattern(
  rawPattern: string,
  relativeDir: string,
): string {
  const isNegated = rawPattern.startsWith('!')
  let pattern = isNegated ? rawPattern.slice(1) : rawPattern
  const directoryOnly = pattern.endsWith('/')
  const core = directoryOnly ? pattern.slice(0, -1) : pattern
  const anchored = core.startsWith('/')
  const coreWithoutLead = anchored ? core.slice(1) : core
  const hasSlash = coreWithoutLead.includes('/')
  const base = normalizeArchivePath(relativeDir)

  let rebased: string
  if (anchored) {
    rebased = base ? `${base}/${coreWithoutLead}` : coreWithoutLead
  } else if (!hasSlash) {
    rebased = base ? `${base}/**/${coreWithoutLead}` : coreWithoutLead
  } else {
    rebased = base ? `${base}/${coreWithoutLead}` : coreWithoutLead
  }
  if (directoryOnly && !rebased.endsWith('/')) rebased += '/'
  rebased = rebased.replace(/\\/g, '/')
  return isNegated ? `!${rebased}` : rebased
}

function parseIgnoreContent(content: string, relativeDir: string): string[] {
  const patterns: string[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    patterns.push(rebaseGitignorePattern(line, relativeDir))
  }
  return patterns
}

function createMatcher(patterns: string[]) {
  return createIgnore().add(patterns)
}

function ignoredByMatcher(
  matcher: ReturnType<typeof createIgnore>,
  relativePath: string,
  isDirectory: boolean,
): boolean {
  const normalized = normalizeArchivePath(relativePath)
  if (!normalized) return false
  return matcher.ignores(isDirectory ? `${normalized}/` : normalized)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function scanLocalProject(params: {
  sourceRoot: string
  outputPath: string
  temporaryPath: string
  extraExcludes: string[]
  includeProtectedEnv: boolean
  signal?: AbortSignal
}): Promise<ArchiveManifest> {
  const sourceStats = await fs.stat(params.sourceRoot)
  if (!sourceStats.isDirectory()) {
    throw new Error(
      `GitZip source_path must be a directory: ${params.sourceRoot}`,
    )
  }

  const initialPatterns = ['.git/', '.git']
  for (const pattern of params.extraExcludes) initialPatterns.push(pattern)
  for (const candidate of [params.outputPath, params.temporaryPath]) {
    if (isPathInside(params.sourceRoot, candidate)) {
      const relative = normalizeArchivePath(
        path.relative(params.sourceRoot, candidate),
      )
      if (relative) initialPatterns.push(`/${relative}`)
    }
  }

  const manifest: ArchiveManifest = {
    entries: [],
    files: 0,
    directories: 0,
    symlinks: 0,
    bytes: 0,
    ignored: 0,
    protectedEnvExcluded: 0,
  }
  const queue: Array<{
    absoluteDir: string
    relativeDir: string
    patterns: string[]
  }> = [
    {
      absoluteDir: params.sourceRoot,
      relativeDir: '',
      patterns: initialPatterns,
    },
  ]

  while (queue.length > 0) {
    if (params.signal?.aborted)
      throw new Error('GitZip archive creation cancelled.')
    const current = queue.shift()!
    const patterns = [...current.patterns]
    for (const ignoreName of IGNORE_FILENAMES) {
      const ignorePath = path.join(current.absoluteDir, ignoreName)
      try {
        const content = await fs.readFile(ignorePath, 'utf8')
        patterns.push(...parseIgnoreContent(content, current.relativeDir))
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        )) {
          throw new Error(
            `Unable to read ignore file ${ignorePath}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    const matcher = createMatcher(patterns)
    const dirEntries = await fs.readdir(current.absoluteDir, {
      withFileTypes: true,
    })
    dirEntries.sort((a, b) => a.name.localeCompare(b.name))

    for (const dirent of dirEntries) {
      if (params.signal?.aborted)
        throw new Error('GitZip archive creation cancelled.')
      const absolutePath = path.join(current.absoluteDir, dirent.name)
      const relativePath = normalizeArchivePath(
        current.relativeDir
          ? `${current.relativeDir}/${dirent.name}`
          : dirent.name,
      )
      const stats = await fs.lstat(absolutePath)
      const type: EntryType = stats.isDirectory()
        ? 'directory'
        : stats.isSymbolicLink()
          ? 'symlink'
          : stats.isFile()
            ? 'file'
            : (() => {
                throw new Error(
                  `Unsupported special filesystem node: ${absolutePath}`,
                )
              })()

      if (ignoredByMatcher(matcher, relativePath, type === 'directory')) {
        manifest.ignored += 1
        continue
      }
      if (!params.includeProtectedEnv && isProtectedEnvFilePath(relativePath)) {
        manifest.protectedEnvExcluded += 1
        continue
      }

      const archiveEntry: ArchiveEntry = {
        relativePath,
        absolutePath,
        type,
        size: type === 'file' ? stats.size : 0,
        mode: stats.mode,
        mtime: stats.mtime,
        ...(type === 'symlink'
          ? { linkTarget: await fs.readlink(absolutePath) }
          : {}),
      }
      manifest.entries.push(archiveEntry)
      if (type === 'file') {
        manifest.files += 1
        manifest.bytes += stats.size
      } else if (type === 'directory') {
        manifest.directories += 1
        queue.push({
          absoluteDir: absolutePath,
          relativeDir: relativePath,
          patterns,
        })
      } else {
        manifest.symlinks += 1
      }
    }
  }

  return manifest
}

async function prepareOutput(
  outputPath: string,
  overwrite: boolean,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  if (!overwrite && (await pathExists(outputPath))) {
    throw new Error(
      `Archive destination already exists: ${outputPath}. Set overwrite=true to replace it.`,
    )
  }
  return path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.codewolf-gitzip-${randomUUID()}.tmp`,
  )
}

async function replaceAtomically(
  temporaryPath: string,
  outputPath: string,
  overwrite: boolean,
): Promise<void> {
  if (overwrite) await fs.rm(outputPath, { force: true })
  await fs.rename(temporaryPath, outputPath)
}

async function createZipArchive(params: {
  manifest: ArchiveManifest
  temporaryPath: string
  outputPath: string
  overwrite: boolean
  compressionLevel?: number
}): Promise<void> {
  const zip = new AdmZip()
  for (const entry of params.manifest.entries) {
    if (entry.type === 'directory') {
      zip.addFile(`${entry.relativePath}/`, Buffer.alloc(0), '', entry.mode)
      continue
    }
    if (entry.type === 'symlink') {
      const zipEntry = zip.addFile(
        entry.relativePath,
        Buffer.from(entry.linkTarget ?? '', 'utf8'),
        '',
        entry.mode,
      )
      zipEntry.attr = ((0o120000 | (entry.mode & 0o7777)) << 16) >>> 0
      continue
    }
    const content = await fs.readFile(entry.absolutePath)
    const zipEntry = zip.addFile(entry.relativePath, content, '', entry.mode)
    if (params.compressionLevel === 0) zipEntry.header.method = 0
  }
  zip.writeZip(params.temporaryPath)
  await replaceAtomically(
    params.temporaryPath,
    params.outputPath,
    params.overwrite,
  )
}

function writeString(
  target: Buffer,
  value: string,
  offset: number,
  length: number,
): void {
  target.write(
    value,
    offset,
    Math.min(Buffer.byteLength(value), length),
    'utf8',
  )
}

function writeOctal(
  target: Buffer,
  value: number,
  offset: number,
  length: number,
): void {
  const safe = Math.max(0, Math.floor(value))
  const encoded = safe
    .toString(8)
    .padStart(length - 1, '0')
    .slice(-(length - 1))
  target.write(encoded, offset, length - 1, 'ascii')
  target[offset + length - 1] = 0
}

function splitTarPath(
  value: string,
): { name: string; prefix: string } | undefined {
  if (Buffer.byteLength(value) <= 100) return { name: value, prefix: '' }
  const segments = value.split('/')
  for (let index = segments.length - 1; index > 0; index--) {
    const prefix = segments.slice(0, index).join('/')
    const name = segments.slice(index).join('/')
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix }
    }
  }
  return undefined
}

function tarHeader(params: {
  path: string
  mode: number
  size: number
  mtime: Date
  type: '0' | '2' | '5' | 'x'
  linkTarget?: string
}): Buffer {
  const header = Buffer.alloc(512)
  const split = splitTarPath(params.path) ?? {
    name: params.path.slice(-100),
    prefix: '',
  }
  writeString(header, split.name, 0, 100)
  writeOctal(header, params.mode & 0o7777, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, params.size, 124, 12)
  writeOctal(header, Math.floor(params.mtime.getTime() / 1000), 136, 12)
  header.fill(0x20, 148, 156)
  writeString(header, params.type, 156, 1)
  if (params.linkTarget) writeString(header, params.linkTarget, 157, 100)
  writeString(header, 'ustar\0', 257, 6)
  writeString(header, '00', 263, 2)
  writeString(header, 'codewolf', 265, 32)
  writeString(header, 'codewolf', 297, 32)
  writeString(header, split.prefix, 345, 155)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  const checksumText = checksum.toString(8).padStart(6, '0').slice(-6)
  header.write(checksumText, 148, 6, 'ascii')
  header[154] = 0
  header[155] = 0x20
  return header
}

function paxRecord(key: string, value: string): string {
  const body = `${key}=${value}\n`
  let length = Buffer.byteLength(body) + 3
  while (true) {
    const record = `${length} ${body}`
    const actual = Buffer.byteLength(record)
    if (actual === length) return record
    length = actual
  }
}

async function writeChunk(stream: Writable, chunk: Buffer): Promise<void> {
  if (stream.write(chunk)) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('drain', onDrain)
      stream.removeListener('error', onError)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    stream.once('drain', onDrain)
    stream.once('error', onError)
  })
}

async function writePadding(stream: Writable, size: number): Promise<void> {
  const remainder = size % 512
  if (remainder) await writeChunk(stream, Buffer.alloc(512 - remainder))
}

async function writePaxIfNeeded(
  stream: Writable,
  entry: ArchiveEntry,
): Promise<void> {
  const records: string[] = []
  if (!splitTarPath(entry.relativePath))
    records.push(paxRecord('path', entry.relativePath))
  if (entry.linkTarget && Buffer.byteLength(entry.linkTarget) > 100) {
    records.push(paxRecord('linkpath', entry.linkTarget))
  }
  if (!records.length) return
  const payload = Buffer.from(records.join(''), 'utf8')
  const paxName = `PaxHeaders/${path.posix.basename(entry.relativePath).slice(0, 70) || 'entry'}`
  await writeChunk(
    stream,
    tarHeader({
      path: paxName,
      mode: 0o600,
      size: payload.length,
      mtime: entry.mtime,
      type: 'x',
    }),
  )
  await writeChunk(stream, payload)
  await writePadding(stream, payload.length)
}

async function createTarArchive(params: {
  manifest: ArchiveManifest
  temporaryPath: string
  outputPath: string
  overwrite: boolean
  gzip: boolean
  compressionLevel?: number
  signal?: AbortSignal
}): Promise<void> {
  const fileStream = createWriteStream(params.temporaryPath, { flags: 'wx' })
  const gzipStream = params.gzip
    ? createGzip({ level: params.compressionLevel ?? 6 })
    : undefined
  const writer: Writable = gzipStream ?? fileStream
  if (gzipStream) gzipStream.pipe(fileStream)

  try {
    for (const entry of params.manifest.entries) {
      if (params.signal?.aborted)
        throw new Error('GitZip archive creation cancelled.')
      await writePaxIfNeeded(writer, entry)
      const type =
        entry.type === 'directory' ? '5' : entry.type === 'symlink' ? '2' : '0'
      const entryPath =
        entry.type === 'directory'
          ? `${entry.relativePath}/`
          : entry.relativePath
      await writeChunk(
        writer,
        tarHeader({
          path: entryPath,
          mode: entry.mode,
          size: entry.type === 'file' ? entry.size : 0,
          mtime: entry.mtime,
          type,
          linkTarget: entry.linkTarget,
        }),
      )
      if (entry.type === 'file') {
        for await (const chunk of createReadStream(entry.absolutePath)) {
          if (params.signal?.aborted)
            throw new Error('GitZip archive creation cancelled.')
          await writeChunk(
            writer,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          )
        }
        await writePadding(writer, entry.size)
      }
    }
    await writeChunk(writer, ZERO_BLOCK)
    await writeChunk(writer, ZERO_BLOCK)
    writer.end()
    await finished(fileStream)
    await replaceAtomically(
      params.temporaryPath,
      params.outputPath,
      params.overwrite,
    )
  } catch (error) {
    writer.destroy(error instanceof Error ? error : new Error(String(error)))
    fileStream.destroy()
    await fs.rm(params.temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function createLocalArchive(
  input: GitzipInput,
  context: GitzipExecutionContext,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const sourceRoot = localSourcePath(context.projectRoot, input.source_path!)
  const format = inferFormat(input.format, input.output_path, 'zip')
  const outputPath = resolveLocalOutput(sourceRoot, input.output_path, format)
  const temporaryPath = await prepareOutput(
    outputPath,
    input.overwrite ?? false,
  )
  const startedAt = Date.now()
  const manifest = await scanLocalProject({
    sourceRoot,
    outputPath,
    temporaryPath,
    extraExcludes: input.extra_excludes ?? [],
    includeProtectedEnv: input.include_protected_env ?? false,
    signal,
  })

  try {
    if (format === 'zip') {
      await createZipArchive({
        manifest,
        temporaryPath,
        outputPath,
        overwrite: input.overwrite ?? false,
        compressionLevel: input.compression_level,
      })
    } else {
      await createTarArchive({
        manifest,
        temporaryPath,
        outputPath,
        overwrite: input.overwrite ?? false,
        gzip: format === 'tar.gz',
        compressionLevel: input.compression_level,
        signal,
      })
    }
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }

  const outputStats = await fs.stat(outputPath)
  return {
    ok: true,
    action: 'create',
    format,
    source_path: sourceRoot,
    output_path: outputPath,
    archive_bytes: outputStats.size,
    source_bytes: manifest.bytes,
    files: manifest.files,
    directories: manifest.directories,
    symlinks: manifest.symlinks,
    ignored_entries: manifest.ignored,
    protected_env_excluded: manifest.protectedEnvExcluded,
    duration_ms: Date.now() - startedAt,
    message: 'Project archive created using root and nested gitignore rules.',
  }
}

function outputValue(outputs: ToolResultOutput[]): Record<string, unknown> {
  const first = outputs.find((entry) => entry.type === 'json')
  if (
    !first ||
    first.type !== 'json' ||
    !first.value ||
    typeof first.value !== 'object' ||
    Array.isArray(first.value)
  ) {
    throw new Error('SSH manager returned an invalid response.')
  }
  const value = first.value as Record<string, unknown>
  if (typeof value.errorMessage === 'string')
    throw new Error(value.errorMessage)
  return value
}

async function sshExecute(
  manager: PersistentSshManager,
  input: Parameters<PersistentSshManager['execute']>[0],
  signal: AbortSignal | undefined,
  context: GitzipExecutionContext,
): Promise<Record<string, unknown>> {
  return outputValue(await manager.execute(input, signal, context))
}

async function readRemoteIgnore(
  manager: PersistentSshManager,
  connectionId: string,
  absolutePath: string,
  signal: AbortSignal | undefined,
  context: GitzipExecutionContext,
): Promise<string | undefined> {
  const result = await manager.execute(
    {
      action: 'read_file',
      connection_id: connectionId,
      path: absolutePath,
      max_bytes: 2_000_000,
      encoding: 'utf8',
    },
    signal,
    context,
  )
  const value = outputValueAllowNotFound(result)
  return typeof value?.content === 'string' ? value.content : undefined
}

function outputValueAllowNotFound(
  outputs: ToolResultOutput[],
): Record<string, unknown> | undefined {
  const first = outputs.find((entry) => entry.type === 'json')
  if (
    !first ||
    first.type !== 'json' ||
    !first.value ||
    typeof first.value !== 'object' ||
    Array.isArray(first.value)
  ) {
    throw new Error('SSH manager returned an invalid response.')
  }
  const value = first.value as Record<string, unknown>
  if (typeof value.errorMessage === 'string') {
    if (/no such file|not found|enoent/i.test(value.errorMessage))
      return undefined
    throw new Error(value.errorMessage)
  }
  return value
}

function asRemoteEntries(value: Record<string, unknown>): RemoteEntry[] {
  if (!Array.isArray(value.entries))
    throw new Error('SSH list response did not contain entries.')
  return value.entries.map((entry) => {
    if (!entry || typeof entry !== 'object')
      throw new Error('SSH list returned an invalid entry.')
    const record = entry as Record<string, unknown>
    if (typeof record.name !== 'string' || typeof record.type !== 'string') {
      throw new Error('SSH list returned an invalid entry.')
    }
    return {
      name: record.name,
      size: typeof record.size === 'number' ? record.size : 0,
      mode: typeof record.mode === 'number' ? record.mode : 0,
      modified_at:
        typeof record.modified_at === 'string' ? record.modified_at : undefined,
      type:
        record.type === 'directory'
          ? 'directory'
          : record.type === 'symlink'
            ? 'symlink'
            : 'file',
    }
  })
}

async function scanRemoteProject(params: {
  manager: PersistentSshManager
  connectionId: string
  sourcePath: string
  outputPath: string
  extraExcludes: string[]
  includeProtectedEnv: boolean
  signal?: AbortSignal
  context: GitzipExecutionContext
}): Promise<RemoteManifest> {
  const pwd = await sshExecute(
    params.manager,
    { action: 'pwd', connection_id: params.connectionId },
    params.signal,
    params.context,
  )
  const cwd = typeof pwd.path === 'string' ? pwd.path : '.'
  const sourceRoot = resolveRemotePath(cwd, params.sourcePath)
  const outputAbsolute = resolveRemotePath(sourceRoot, params.outputPath)
  const outputRelative = posixPath.relative(sourceRoot, outputAbsolute)
  const initialPatterns = ['.git/', '.git', ...params.extraExcludes]
  if (outputRelative && !outputRelative.startsWith('../')) {
    initialPatterns.push(`/${normalizeArchivePath(outputRelative)}`)
  }

  const manifest: RemoteManifest = {
    sourceRoot,
    paths: [],
    files: 0,
    directories: 0,
    symlinks: 0,
    bytes: 0,
    ignored: 0,
    protectedEnvExcluded: 0,
  }
  const queue: Array<{
    absoluteDir: string
    relativeDir: string
    patterns: string[]
  }> = [{ absoluteDir: sourceRoot, relativeDir: '', patterns: initialPatterns }]

  while (queue.length > 0) {
    if (params.signal?.aborted) throw new Error('Remote GitZip scan cancelled.')
    const current = queue.shift()!
    const patterns = [...current.patterns]
    for (const ignoreName of IGNORE_FILENAMES) {
      const content = await readRemoteIgnore(
        params.manager,
        params.connectionId,
        posixPath.join(current.absoluteDir, ignoreName),
        params.signal,
        params.context,
      )
      if (content !== undefined)
        patterns.push(...parseIgnoreContent(content, current.relativeDir))
    }
    const matcher = createMatcher(patterns)
    const listResult = await sshExecute(
      params.manager,
      {
        action: 'list',
        connection_id: params.connectionId,
        path: current.absoluteDir,
      },
      params.signal,
      params.context,
    )
    const entries = asRemoteEntries(listResult).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue
      const relativePath = normalizeArchivePath(
        current.relativeDir
          ? `${current.relativeDir}/${entry.name}`
          : entry.name,
      )
      if (ignoredByMatcher(matcher, relativePath, entry.type === 'directory')) {
        manifest.ignored += 1
        continue
      }
      if (!params.includeProtectedEnv && isProtectedEnvFilePath(relativePath)) {
        manifest.protectedEnvExcluded += 1
        continue
      }
      manifest.paths.push(
        entry.type === 'directory' ? `${relativePath}/` : relativePath,
      )
      if (entry.type === 'directory') {
        manifest.directories += 1
        queue.push({
          absoluteDir: posixPath.join(current.absoluteDir, entry.name),
          relativeDir: relativePath,
          patterns,
        })
      } else if (entry.type === 'symlink') {
        manifest.symlinks += 1
      } else {
        manifest.files += 1
        manifest.bytes += entry.size
      }
    }
  }
  return manifest
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function validateRemoteArchiveArgs(format: GitzipFormat, args: string[]): void {
  const allowed = format === 'zip' ? SAFE_ZIP_ARGUMENT : SAFE_TAR_ARGUMENT
  for (const argument of args) {
    if (
      argument.includes('\0') ||
      argument.includes('\n') ||
      argument.includes('\r') ||
      !allowed.test(argument)
    ) {
      throw new Error(
        `Remote archive argument is not in the safe ${format} allowlist: ${argument}`,
      )
    }
  }
}

function remoteFormatCommand(params: {
  format: GitzipFormat
  sourceRoot: string
  outputPath: string
  manifestPath: string
  compressionLevel?: number
  overwrite: boolean
  archiveArgs: string[]
}): string {
  validateRemoteArchiveArgs(params.format, params.archiveArgs)
  const commonPrefix = params.overwrite
    ? `rm -f ${shellQuote(params.outputPath)} && mkdir -p ${shellQuote(posixPath.dirname(params.outputPath))}`
    : `test ! -e ${shellQuote(params.outputPath)} && mkdir -p ${shellQuote(posixPath.dirname(params.outputPath))}`
  if (params.format === 'zip') {
    const level =
      params.compressionLevel === undefined
        ? []
        : [`-${params.compressionLevel}`]
    const args = [...level, '-q', '-y', ...params.archiveArgs]
      .map(shellQuote)
      .join(' ')
    return `${commonPrefix} && cd ${shellQuote(params.sourceRoot)} && zip ${args} ${shellQuote(params.outputPath)} -@ < ${shellQuote(params.manifestPath)}`
  }
  const levelPrefix =
    params.format === 'tar.gz' && params.compressionLevel !== undefined
      ? `GZIP=${shellQuote(`-${params.compressionLevel}`)} `
      : ''
  const compression = params.format === 'tar.gz' ? 'z' : ''
  const args = params.archiveArgs.map(shellQuote).join(' ')
  return `${commonPrefix} && ${levelPrefix}tar ${args} --no-recursion --null -C ${shellQuote(params.sourceRoot)} -T ${shellQuote(params.manifestPath)} -c${compression}f ${shellQuote(params.outputPath)}`
}

async function createRemoteArchive(
  input: GitzipInput,
  context: GitzipExecutionContext,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const manager = context.sshManager ?? getPersistentSshManager()
  const format = inferFormat(input.format, input.output_path, 'tar.gz')
  const connectionId = input.connection_id!
  const sourcePath = input.source_path!
  const remoteProjectName =
    posixPath.basename(sourcePath.replace(/\/+$/, '')) || 'project'
  const requestedOutput =
    input.output_path ?? `${remoteProjectName}.${archiveExtension(format)}`
  const manifest = await scanRemoteProject({
    manager,
    connectionId,
    sourcePath,
    outputPath: requestedOutput,
    extraExcludes: input.extra_excludes ?? [],
    includeProtectedEnv: input.include_protected_env ?? false,
    signal,
    context,
  })
  const outputPath = resolveRemotePath(manifest.sourceRoot, requestedOutput)
  const manifestPath = posixPath.join(
    '/tmp',
    `codewolf-gitzip-${randomUUID()}.list`,
  )
  if (
    format === 'zip' &&
    manifest.paths.some((entry) => /[\r\n]/.test(entry))
  ) {
    throw new Error(
      'Remote ZIP cannot safely package paths containing newline characters. Use tar or tar.gz.',
    )
  }
  const manifestContent =
    format === 'zip'
      ? `${manifest.paths.join('\n')}${manifest.paths.length ? '\n' : ''}`
      : Buffer.from(
          `${manifest.paths.join('\0')}${manifest.paths.length ? '\0' : ''}`,
        ).toString('base64')

  try {
    await sshExecute(
      manager,
      {
        action: 'write_file',
        connection_id: connectionId,
        path: manifestPath,
        content: manifestContent,
        encoding: format === 'zip' ? 'utf8' : 'base64',
        overwrite: true,
      },
      signal,
      context,
    )
    const command = remoteFormatCommand({
      format,
      sourceRoot: manifest.sourceRoot,
      outputPath,
      manifestPath,
      compressionLevel: input.compression_level,
      overwrite: input.overwrite ?? false,
      archiveArgs: input.archive_args ?? [],
    })
    const result = await sshExecute(
      manager,
      {
        action: 'exec',
        connection_id: connectionId,
        command,
        timeout_seconds: input.timeout_seconds ?? 600,
        max_bytes: 200_000,
      },
      signal,
      context,
    )
    if (result.exitCode !== 0) {
      throw new Error(
        `Remote ${format} command failed: ${String(result.stderr || result.stdout || `exit ${String(result.exitCode)}`)}`,
      )
    }
    const stats = await sshExecute(
      manager,
      { action: 'stat', connection_id: connectionId, path: outputPath },
      signal,
      context,
    )
    return {
      ok: true,
      action: 'remote_create',
      connection_id: connectionId,
      format,
      source_path: manifest.sourceRoot,
      output_path: outputPath,
      archive_bytes: stats.size,
      source_bytes: manifest.bytes,
      files: manifest.files,
      directories: manifest.directories,
      symlinks: manifest.symlinks,
      ignored_entries: manifest.ignored,
      protected_env_excluded: manifest.protectedEnvExcluded,
      message:
        'Remote archive created from an explicit gitignore-aware manifest.',
    }
  } finally {
    await manager
      .execute(
        { action: 'delete', connection_id: connectionId, path: manifestPath },
        undefined,
        context,
      )
      .catch(() => undefined)
  }
}

function remoteExtractCommand(params: {
  format: GitzipFormat
  archivePath: string
  extractPath: string
  overwrite: boolean
  cleanup: boolean
}): string {
  const mkdir = `mkdir -p ${shellQuote(params.extractPath)}`
  let extract: string
  if (params.format === 'zip') {
    extract = `unzip -q ${params.overwrite ? '-o' : '-n'} ${shellQuote(params.archivePath)} -d ${shellQuote(params.extractPath)}`
  } else {
    const compression = params.format === 'tar.gz' ? 'z' : ''
    const keep = params.overwrite ? '' : '--keep-old-files '
    extract = `tar ${keep}-x${compression}f ${shellQuote(params.archivePath)} -C ${shellQuote(params.extractPath)}`
  }
  return `${mkdir} && ${extract}${params.cleanup ? ` && rm -f ${shellQuote(params.archivePath)}` : ''}`
}

async function extractRemoteArchive(
  input: GitzipInput,
  context: GitzipExecutionContext,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const manager = context.sshManager ?? getPersistentSshManager()
  const connectionId = input.connection_id!
  const pwd = await sshExecute(
    manager,
    { action: 'pwd', connection_id: connectionId },
    signal,
    context,
  )
  const cwd = typeof pwd.path === 'string' ? pwd.path : '.'
  const archivePath = resolveRemotePath(cwd, input.source_path!)
  const format = inferFormat(input.format, archivePath, 'tar.gz')
  const extractPath = resolveRemotePath(
    cwd,
    input.extract_path ?? posixPath.dirname(archivePath),
  )
  const result = await sshExecute(
    manager,
    {
      action: 'exec',
      connection_id: connectionId,
      command: remoteExtractCommand({
        format,
        archivePath,
        extractPath,
        overwrite: input.overwrite ?? false,
        cleanup: input.cleanup_remote_archive ?? false,
      }),
      timeout_seconds: input.timeout_seconds ?? 600,
      max_bytes: 200_000,
    },
    signal,
    context,
  )
  if (result.exitCode !== 0) {
    throw new Error(
      `Remote archive extraction failed: ${String(result.stderr || result.stdout || `exit ${String(result.exitCode)}`)}`,
    )
  }
  return {
    ok: true,
    action: 'remote_extract',
    connection_id: connectionId,
    format,
    archive_path: archivePath,
    extract_path: extractPath,
    archive_deleted: input.cleanup_remote_archive ?? false,
    message: 'Remote archive extracted successfully.',
  }
}

async function uploadArchive(
  input: GitzipInput,
  context: GitzipExecutionContext,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const manager = context.sshManager ?? getPersistentSshManager()
  const local = await createLocalArchive(input, context, signal)
  const localPath = String(local.output_path)
  const format = local.format as GitzipFormat
  const connectionId = input.connection_id!
  const remotePath =
    input.remote_path ?? path.basename(localPath).replace(/\\/g, '/')
  let uploadResult: Record<string, unknown>
  try {
    uploadResult = await sshExecute(
      manager,
      {
        action: 'upload',
        connection_id: connectionId,
        local_path: localPath,
        remote_path: remotePath,
        overwrite: input.overwrite ?? false,
      },
      signal,
      context,
    )
    let extraction: Record<string, unknown> | undefined
    if (input.extract_remote) {
      extraction = await extractRemoteArchive(
        {
          ...input,
          action: 'remote_extract',
          source_path: String(uploadResult.remote_path ?? remotePath),
          format,
        },
        context,
        signal,
      )
    }
    if (input.cleanup_local) await fs.rm(localPath, { force: true })
    return {
      ok: true,
      action: 'upload',
      format,
      local_archive: local,
      connection_id: connectionId,
      remote_path: uploadResult.remote_path ?? remotePath,
      uploaded_bytes: uploadResult.bytes,
      ...(extraction ? { extraction } : {}),
      local_archive_deleted: input.cleanup_local ?? false,
      message: input.extract_remote
        ? 'Gitignore-aware project archive uploaded and extracted remotely.'
        : 'Gitignore-aware project archive uploaded through the persistent SSH connection.',
    }
  } catch (error) {
    throw error
  }
}

export async function executeGitzip(
  input: GitzipInput,
  signal?: AbortSignal,
  context: GitzipExecutionContext = {},
): Promise<ToolResultOutput[]> {
  if (signal?.aborted)
    return json({
      action: input.action,
      errorMessage: 'GitZip action cancelled.',
    })
  try {
    switch (input.action) {
      case 'create':
        return json(await createLocalArchive(input, context, signal))
      case 'upload':
        return json(await uploadArchive(input, context, signal))
      case 'remote_create':
        return json(await createRemoteArchive(input, context, signal))
      case 'remote_extract':
        return json(await extractRemoteArchive(input, context, signal))
      default:
        return json({
          action: input.action,
          errorMessage: `Unsupported GitZip action: ${String(input.action)}`,
        })
    }
  } catch (error) {
    return json({
      action: input.action,
      connection_id: input.connection_id,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}
