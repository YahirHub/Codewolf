import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

import { getCodewolfHomeDir } from '../util/codewolf-home'

export interface EcosystemCacheEntry<T = unknown> {
  version: 2
  key: string
  createdAt: string
  expiresAt: string
  value: T
}

interface CacheKeyDescriptor {
  ecosystem?: string
  operation?: string
  query?: string
  package?: string
  module?: string
  version?: string
  topic?: string
  limit?: number
}

interface CacheLocation {
  directory: string
  stemPrefix: string
  legacyPath: string
}

const CACHE_VERSION = 2 as const
const LEGACY_CACHE_VERSION = 1
const MAX_CACHE_FILES = 500

const ECOSYSTEM_LAYOUT: Record<
  string,
  { language: string; packageManager: string }
> = {
  npm: { language: 'nodejs', packageManager: 'npm' },
  pypi: { language: 'python', packageManager: 'pypi' },
  go: { language: 'go', packageManager: 'pkg.go.dev' },
}

export function getEcosystemResearchCacheDir(
  configDir = getCodewolfHomeDir(),
): string {
  return path.join(configDir, 'research-cache', 'ecosystems')
}

export function getProjectEcosystemResearchCacheDir(
  projectRoot: string,
): string {
  return path.join(projectRoot, '.codewolf', 'research-cache', 'ecosystems')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseCacheKey(key: string): CacheKeyDescriptor | undefined {
  try {
    const parsed = JSON.parse(key) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as CacheKeyDescriptor
  } catch {
    return undefined
  }
}

function sanitizeSegment(value: string, fallback = 'unknown'): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[<>:"|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100)
  return normalized || fallback
}

function safePathSegments(value: string): string[] {
  const segments = value
    .split(/[\\/]+/)
    .map((segment) => sanitizeSegment(segment))
    .filter((segment) => segment !== '.' && segment !== '..')
  return segments.length > 0 ? segments : ['unknown']
}

function getCacheLocation(key: string, cacheDir: string): CacheLocation {
  const descriptor = parseCacheKey(key)
  const digest = createHash('sha256').update(key).digest('hex')
  const legacyPath = path.join(cacheDir, `${digest}.json`)

  if (!descriptor?.ecosystem || !descriptor.operation) {
    return {
      directory: cacheDir,
      stemPrefix: digest,
      legacyPath,
    }
  }

  const layout = ECOSYSTEM_LAYOUT[descriptor.ecosystem] ?? {
    language: descriptor.ecosystem,
    packageManager: descriptor.ecosystem,
  }
  const packageIdentity = descriptor.package ?? descriptor.module
  const identitySegments = packageIdentity
    ? safePathSegments(packageIdentity)
    : [
        '_search',
        sanitizeSegment(descriptor.query ?? 'general-research', 'general'),
      ]
  const requestedVersion = sanitizeSegment(
    descriptor.version ?? 'latest',
    'latest',
  )
  const operation = sanitizeSegment(descriptor.operation, 'research')
  const topic = descriptor.topic
    ? `--${sanitizeSegment(descriptor.topic)}`
    : ''
  const limit =
    !packageIdentity && descriptor.limit
      ? `--limit-${Math.max(1, Math.floor(descriptor.limit))}`
      : ''

  return {
    directory: path.join(
      cacheDir,
      sanitizeSegment(layout.language),
      sanitizeSegment(layout.packageManager),
      ...identitySegments,
      requestedVersion,
    ),
    stemPrefix: `${operation}${topic}${limit}`,
    legacyPath,
  }
}

function readCacheEntry<T>(filePath: string): EcosystemCacheEntry<T> | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
      | EcosystemCacheEntry<T>
      | (Omit<EcosystemCacheEntry<T>, 'version'> & { version: 1 })
      | undefined
    if (
      (parsed?.version !== CACHE_VERSION &&
        parsed?.version !== LEGACY_CACHE_VERSION) ||
      typeof parsed.key !== 'string' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      return undefined
    }
    return {
      ...parsed,
      version: CACHE_VERSION,
    }
  } catch {
    return undefined
  }
}

function findCacheFile<T>(params: {
  key: string
  cacheDir: string
}): { filePath: string; entry: EcosystemCacheEntry<T> } | undefined {
  const location = getCacheLocation(params.key, params.cacheDir)

  try {
    const candidates = fs
      .readdirSync(location.directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name.startsWith(location.stemPrefix),
      )
      .map((entry) => path.join(location.directory, entry.name))

    for (const filePath of candidates) {
      const entry = readCacheEntry<T>(filePath)
      if (entry?.key === params.key) {
        return { filePath, entry }
      }
    }
  } catch {
    // The semantic cache directory may not exist yet.
  }

  const legacyEntry = readCacheEntry<T>(location.legacyPath)
  if (legacyEntry?.key === params.key) {
    return { filePath: location.legacyPath, entry: legacyEntry }
  }

  return undefined
}

function removeCachePair(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Best effort.
  }
  try {
    fs.unlinkSync(filePath.replace(/\.json$/i, '.md'))
  } catch {
    // Best effort.
  }
}

export function loadEcosystemCache<T>(params: {
  key: string
  cacheDir?: string
  now?: Date
}): EcosystemCacheEntry<T> | undefined {
  const cacheDir = params.cacheDir ?? getEcosystemResearchCacheDir()
  const found = findCacheFile<T>({ key: params.key, cacheDir })
  if (!found) return undefined

  const now = params.now ?? new Date()
  if (Date.parse(found.entry.expiresAt) <= now.getTime()) {
    removeCachePair(found.filePath)
    return undefined
  }

  return found.entry
}


export function deleteEcosystemCache(params: {
  key: string
  cacheDir?: string
}): void {
  const cacheDir = params.cacheDir ?? getEcosystemResearchCacheDir()
  const found = findCacheFile({ key: params.key, cacheDir })
  if (found) {
    removeCachePair(found.filePath)
  }
}

function listFilesRecursively(directory: string): string[] {
  const result: string[] = []
  const pending = [directory]

  while (pending.length > 0) {
    const current = pending.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const filePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(filePath)
      } else if (entry.isFile()) {
        result.push(filePath)
      }
    }
  }

  return result
}

function pruneCache(cacheDir: string): void {
  try {
    const files = listFilesRecursively(cacheDir)
      .filter((filePath) => filePath.endsWith('.json'))
      .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const stale of files.slice(MAX_CACHE_FILES)) {
      removeCachePair(stale.filePath)
    }
  } catch {
    // Cache pruning must never fail research.
  }
}

function findResolvedVersion(value: unknown): string | undefined {
  const response = asRecord(value)
  const data = asRecord(response.data)
  const candidates = [
    data.selectedVersion,
    data.version,
    data.latestPublishedVersion,
    data.latestStableVersion,
    response.version,
  ]
  return candidates.map(asNonEmptyString).find(Boolean)
}

function getSemanticFileStem(params: {
  key: string
  value: unknown
  cacheDir: string
}): { directory: string; stem: string } {
  const location = getCacheLocation(params.key, params.cacheDir)
  const resolvedVersion = findResolvedVersion(params.value)
  const suffix = resolvedVersion
    ? `--${sanitizeSegment(resolvedVersion, 'version')}`
    : ''
  return {
    directory: location.directory,
    stem: `${location.stemPrefix}${suffix}`,
  }
}

function yamlString(value: string | undefined): string {
  return JSON.stringify(value ?? '')
}

function renderKnownSummary(data: Record<string, unknown>): string[] {
  const fields: Array<[string, unknown]> = [
    ['Paquete', data.name ?? data.package ?? data.modulePath],
    ['Versión seleccionada', data.selectedVersion ?? data.version],
    ['Última publicación', data.latestPublishedVersion],
    ['Última estable', data.latestStableVersion],
    ['Prerelease', data.selectedVersionIsPrerelease],
    ['Python requerido', data.requiresPython],
    ['Licencia', data.license],
    ['Repositorio', data.repository],
    ['Documentación', data.documentation],
  ]

  return fields
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => {
      const rendered =
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `- **${label}:** ${rendered}`
    })
}

function renderMarkdown<T>(params: {
  entry: EcosystemCacheEntry<T>
}): string {
  const descriptor = parseCacheKey(params.entry.key) ?? {}
  const response = asRecord(params.entry.value)
  const data = asRecord(response.data)
  const layout = ECOSYSTEM_LAYOUT[descriptor.ecosystem ?? ''] ?? {
    language: descriptor.ecosystem ?? 'unknown',
    packageManager: descriptor.ecosystem ?? 'unknown',
  }
  const identity =
    descriptor.package ?? descriptor.module ?? descriptor.query ?? 'research'
  const resolvedVersion = findResolvedVersion(params.entry.value)
  const sourceUrl = asNonEmptyString(response.sourceUrl)
  const knownSummary = renderKnownSummary(data)

  return [
    '---',
    `codewolf_cache_version: ${CACHE_VERSION}`,
    `language: ${yamlString(layout.language)}`,
    `package_manager: ${yamlString(layout.packageManager)}`,
    `ecosystem: ${yamlString(descriptor.ecosystem)}`,
    `operation: ${yamlString(descriptor.operation)}`,
    `package: ${yamlString(identity)}`,
    `requested_version: ${yamlString(descriptor.version ?? 'latest')}`,
    `resolved_version: ${yamlString(resolvedVersion)}`,
    `topic: ${yamlString(descriptor.topic)}`,
    `created_at: ${yamlString(params.entry.createdAt)}`,
    `expires_at: ${yamlString(params.entry.expiresAt)}`,
    `source_url: ${yamlString(sourceUrl)}`,
    '---',
    '',
    `# ${layout.language} · ${layout.packageManager} · ${identity}`,
    '',
    `**Operación:** ${descriptor.operation ?? 'research'}`,
    resolvedVersion ? `**Versión:** ${resolvedVersion}` : '',
    descriptor.topic ? `**Tema:** ${descriptor.topic}` : '',
    sourceUrl ? `**Fuente oficial:** ${sourceUrl}` : '',
    '',
    '## Resumen',
    '',
    ...(knownSummary.length > 0
      ? knownSummary
      : ['- Resultado estructurado guardado para reutilización local.']),
    '',
    '## Datos estructurados',
    '',
    '```json',
    JSON.stringify(response.data ?? params.entry.value, null, 2),
    '```',
    '',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n')
}

function removePreviousEntriesForKey(params: {
  directory: string
  stemPrefix: string
  key: string
}): void {
  try {
    for (const entry of fs.readdirSync(params.directory, {
      withFileTypes: true,
    })) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.json') ||
        !entry.name.startsWith(params.stemPrefix)
      ) {
        continue
      }
      const filePath = path.join(params.directory, entry.name)
      const cached = readCacheEntry(filePath)
      if (cached?.key === params.key) {
        removeCachePair(filePath)
      }
    }
  } catch {
    // Directory may not exist yet.
  }
}

export function saveEcosystemCache<T>(params: {
  key: string
  value: T
  ttlMs: number
  cacheDir?: string
  now?: Date
}): EcosystemCacheEntry<T> {
  const cacheDir = params.cacheDir ?? getEcosystemResearchCacheDir()
  const now = params.now ?? new Date()
  const entry: EcosystemCacheEntry<T> = {
    version: CACHE_VERSION,
    key: params.key,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + params.ttlMs).toISOString(),
    value: params.value,
  }

  try {
    const location = getCacheLocation(params.key, cacheDir)
    const semantic = getSemanticFileStem({
      key: params.key,
      value: params.value,
      cacheDir,
    })
    fs.mkdirSync(semantic.directory, { recursive: true, mode: 0o700 })
    removePreviousEntriesForKey({
      directory: semantic.directory,
      stemPrefix: location.stemPrefix,
      key: params.key,
    })

    const jsonPath = path.join(semantic.directory, `${semantic.stem}.json`)
    const markdownPath = path.join(semantic.directory, `${semantic.stem}.md`)
    const jsonTempPath = `${jsonPath}.${process.pid}.${Date.now()}.tmp`
    const markdownTempPath = `${markdownPath}.${process.pid}.${Date.now()}.tmp`

    fs.writeFileSync(jsonTempPath, `${JSON.stringify(entry, null, 2)}\n`, {
      mode: 0o600,
    })
    fs.writeFileSync(markdownTempPath, renderMarkdown({ entry }), {
      mode: 0o600,
    })
    fs.renameSync(jsonTempPath, jsonPath)
    fs.renameSync(markdownTempPath, markdownPath)

    try {
      fs.chmodSync(jsonPath, 0o600)
      fs.chmodSync(markdownPath, 0o600)
    } catch {
      // Windows does not enforce POSIX modes.
    }
    pruneCache(cacheDir)
  } catch {
    // Cache failures are non-fatal.
  }

  return entry
}
