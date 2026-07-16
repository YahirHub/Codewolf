import { loadEcosystemCache, saveEcosystemCache } from './cache'

export const ECOSYSTEM_IDS = ['npm', 'pypi', 'go'] as const
export type EcosystemId = (typeof ECOSYSTEM_IDS)[number]

export const ECOSYSTEM_OPERATIONS = [
  'search',
  'package',
  'documentation',
  'symbols',
  'versions',
  'vulnerabilities',
] as const
export type EcosystemOperation = (typeof ECOSYSTEM_OPERATIONS)[number]

export interface EcosystemLookupInput {
  ecosystem: EcosystemId
  operation: EcosystemOperation
  query?: string
  package?: string
  module?: string
  version?: string
  topic?: string
  limit?: number
  refresh?: boolean
}

export interface EcosystemLookupResponse {
  ecosystem: EcosystemId
  operation: EcosystemOperation
  sourceUrl: string
  fetchedAt: string
  cached: boolean
  data: unknown
}

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const PYPI_ORIGIN = 'https://pypi.org'
const GO_PACKAGE_ORIGIN = 'https://pkg.go.dev'
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10
const HTTP_TIMEOUT_MS = 15_000
const MAX_DOCUMENTATION_CHARS = 6_000

const HOURS = 60 * 60 * 1000
const DAYS = 24 * HOURS

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function compactObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null || entry === '') return false
      if (Array.isArray(entry) && entry.length === 0) return false
      if (
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        Object.keys(entry as Record<string, unknown>).length === 0
      ) {
        return false
      }
      return true
    }),
  )
}

function compactJsonPreview(value: unknown, maxChars = 1_500): unknown {
  if (value === undefined || value === null) return undefined

  try {
    const serialized = JSON.stringify(value)
    if (!serialized || serialized === '{}' || serialized === '[]') {
      return undefined
    }
    if (serialized.length <= maxChars) return value
    return `${serialized.slice(0, Math.max(0, maxChars - 24))}… [truncated]`
  } catch {
    return undefined
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit ?? DEFAULT_LIMIT)))
}

function buildCacheKey(input: EcosystemLookupInput): string {
  return JSON.stringify({
    ecosystem: input.ecosystem,
    operation: input.operation,
    query: input.query?.trim() || undefined,
    package: input.package?.trim() || undefined,
    module: input.module?.trim() || undefined,
    version: input.version?.trim() || undefined,
    topic: input.topic?.trim().toLowerCase() || undefined,
    limit: normalizeLimit(input.limit),
  })
}

function getCacheTtlMs(input: EcosystemLookupInput): number {
  if (input.operation === 'vulnerabilities') return HOURS
  if (input.operation === 'search' || input.operation === 'versions') {
    return 6 * HOURS
  }
  if (input.version && input.version !== 'latest') return 30 * DAYS
  return 6 * HOURS
}

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function createAbortSignal(parentSignal?: AbortSignal): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(new Error('Ecosystem lookup timed out.')),
    HTTP_TIMEOUT_MS,
  )
  const abortFromParent = () => controller.abort(parentSignal?.reason)

  if (parentSignal?.aborted) {
    abortFromParent()
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

async function fetchJson(params: {
  url: URL
  fetch: typeof globalThis.fetch
  signal?: AbortSignal
  accept?: string
}): Promise<unknown> {
  const { signal, cleanup } = createAbortSignal(params.signal)
  try {
    const response = await params.fetch(params.url, {
      method: 'GET',
      headers: {
        Accept: params.accept ?? 'application/json',
        'User-Agent': 'Codewolf-Ecosystem-Research/1.0',
      },
      signal,
    })

    const text = await response.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(
        `The official package service returned invalid JSON (${response.status}).`,
      )
    }

    if (!response.ok) {
      const record = asRecord(payload)
      const message =
        asString(record.message) ??
        asString(record.error) ??
        `Official package service returned HTTP ${response.status}.`
      const fixes = asArray(record.fixes)
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 3)
      const candidates = asArray(record.candidates)
        .map((item) =>
          typeof item === 'string'
            ? item
            : (asString(asRecord(item).modulePath) ??
              asString(asRecord(item).path)),
        )
        .filter((item): item is string => Boolean(item))
        .slice(0, 5)
      const guidance = [
        fixes.length > 0 ? `Fixes: ${fixes.join('; ')}` : '',
        candidates.length > 0
          ? `Candidate modules: ${candidates.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
      throw new Error(guidance ? `${message} ${guidance}` : message)
    }

    return payload
  } finally {
    cleanup()
  }
}

function normalizeRepository(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.replace(/^git\+/, '').replace(/\.git$/, '')
  }
  const record = asRecord(value)
  return asString(record.url)
    ?.replace(/^git\+/, '')
    .replace(/\.git$/, '')
}

function normalizePerson(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  const name = asString(record.name)
  const email = asString(record.email)
  return name && email ? `${name} <${email}>` : (name ?? email)
}

function dependencySummary(value: unknown): {
  count: number
  names: string[]
} {
  const record = asRecord(value)
  return {
    count: Object.keys(record).length,
    names: Object.keys(record).slice(0, 20),
  }
}

function lifecycleScripts(value: unknown): Record<string, string> {
  const scripts = asRecord(value)
  const selected: Record<string, string> = {}
  for (const name of [
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'prepublishOnly',
    'prepare',
  ]) {
    const script = asString(scripts[name])
    if (script) selected[name] = script.slice(0, 500)
  }
  return selected
}

function normalizeNpmSearch(payload: unknown, limit: number): unknown {
  const root = asRecord(payload)
  const objects = asArray(root.objects).slice(0, limit)
  return compactObject({
    total: asNumber(root.total),
    results: objects.map((entry) => {
      const object = asRecord(entry)
      const pkg = asRecord(object.package)
      const links = asRecord(pkg.links)
      const score = asRecord(object.score)
      return compactObject({
        name: asString(pkg.name),
        version: asString(pkg.version),
        description: asString(pkg.description),
        publishedAt: asString(pkg.date),
        publisher: normalizePerson(pkg.publisher),
        keywords: asArray(pkg.keywords)
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 12),
        score: asNumber(score.final),
        npmUrl: asString(links.npm),
        homepage: asString(links.homepage),
        repository: asString(links.repository),
      })
    }),
  })
}

function isPrereleaseVersion(version: string | undefined): boolean {
  if (!version) return false
  const normalized = version.trim().replace(/^v/i, '')
  const core = normalized.split('+', 1)[0] ?? normalized

  // SemVer prereleases use a hyphen. Python's PEP 440 also permits compact
  // forms such as 3.0rc1, 2.1b2, 1.0a1, and 4.0.dev3.
  return (
    core.includes('-') ||
    /(?:^|[.\d])(?:a|b|rc|alpha|beta|pre|preview|dev)\d*(?:$|[.+])/i.test(
      core,
    )
  )
}

function compareSemverLike(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split('-', 1)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10))
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return a.localeCompare(b)
}

function latestNonPrereleaseVersion(
  packument: Record<string, unknown>,
): string | undefined {
  const versions = Object.keys(asRecord(packument.versions)).filter(
    (version) => !isPrereleaseVersion(version),
  )
  if (versions.length === 0) return undefined

  const time = asRecord(packument.time)
  return versions.sort((a, b) => {
    const aTime = Date.parse(asString(time[a]) ?? '')
    const bTime = Date.parse(asString(time[b]) ?? '')
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime
    }
    return compareSemverLike(b, a)
  })[0]
}

function selectNpmVersion(
  packument: Record<string, unknown>,
  requestedVersion: string | undefined,
): { version: string; metadata: Record<string, unknown> } {
  const distTags = asRecord(packument['dist-tags'])
  const latest = asString(distTags.latest)
  const version =
    !requestedVersion || requestedVersion === 'latest'
      ? latest
      : (asString(distTags[requestedVersion]) ?? requestedVersion)
  if (!version)
    throw new Error('The npm package does not publish a latest tag.')

  const versions = asRecord(packument.versions)
  const metadata = asRecord(versions[version])
  if (Object.keys(metadata).length === 0) {
    throw new Error(`npm version ${version} was not found for this package.`)
  }
  return { version, metadata }
}

function normalizeNpmPackage(params: {
  packageName: string
  payload: unknown
  requestedVersion?: string
}): unknown {
  const packument = asRecord(params.payload)
  const { version, metadata } = selectNpmVersion(
    packument,
    params.requestedVersion,
  )
  const distTags = asRecord(packument['dist-tags'])
  const time = asRecord(packument.time)
  const dist = asRecord(metadata.dist)
  const maintainers = asArray(packument.maintainers)
    .map(normalizePerson)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5)

  return compactObject({
    name: asString(packument.name) ?? params.packageName,
    selectedVersion: version,
    selectedVersionIsPrerelease: isPrereleaseVersion(version),
    latestPublishedVersion: asString(distTags.latest),
    latestPublishedIsPrerelease: isPrereleaseVersion(asString(distTags.latest)),
    latestStableVersion: latestNonPrereleaseVersion(packument),
    distTags: Object.fromEntries(
      Object.entries(distTags)
        .filter(([, value]) => typeof value === 'string')
        .slice(0, 10),
    ),
    description:
      asString(metadata.description) ?? asString(packument.description),
    license: asString(metadata.license) ?? asString(packument.license),
    publishedAt: asString(time[version]),
    modifiedAt: asString(time.modified),
    deprecated: asString(metadata.deprecated),
    engines: asRecord(metadata.engines),
    os: asArray(metadata.os).slice(0, 10),
    cpu: asArray(metadata.cpu).slice(0, 10),
    libc: asArray(metadata.libc).slice(0, 10),
    types: asString(metadata.types) ?? asString(metadata.typings),
    moduleType: asString(metadata.type),
    exports: compactJsonPreview(metadata.exports, 1_500),
    packageManager: asString(metadata.packageManager),
    dependencies: dependencySummary(metadata.dependencies),
    peerDependencies: dependencySummary(metadata.peerDependencies),
    optionalDependencies: dependencySummary(metadata.optionalDependencies),
    lifecycleScripts: lifecycleScripts(metadata.scripts),
    maintainers,
    repository: normalizeRepository(
      metadata.repository ?? packument.repository,
    ),
    homepage: asString(metadata.homepage) ?? asString(packument.homepage),
    bugs: asString(asRecord(metadata.bugs ?? packument.bugs).url),
    npmUrl: `https://www.npmjs.com/package/${params.packageName}`,
    tarball: asString(dist.tarball),
    integrity: asString(dist.integrity),
    readmeAvailable: Boolean(asString(packument.readme)),
  })
}

function extractRelevantText(text: string, topic: string | undefined): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  if (!topic?.trim()) return normalized.slice(0, MAX_DOCUMENTATION_CHARS)

  const terms = topic
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9_.-]/gi, ''))
    .filter((term) => term.length >= 2)
  if (terms.length === 0) return normalized.slice(0, MAX_DOCUMENTATION_CHARS)

  const lines = normalized.split('\n')
  const matchedIndexes: number[] = []
  for (let index = 0; index < lines.length; index++) {
    const lower = lines[index].toLowerCase()
    if (terms.some((term) => lower.includes(term))) matchedIndexes.push(index)
    if (matchedIndexes.length >= 6) break
  }

  if (matchedIndexes.length === 0) {
    return normalized.slice(0, MAX_DOCUMENTATION_CHARS)
  }

  const selected = new Set<number>()
  for (const index of matchedIndexes) {
    for (
      let line = Math.max(0, index - 4);
      line <= Math.min(lines.length - 1, index + 12);
      line++
    ) {
      selected.add(line)
    }
  }

  const chunks: string[] = []
  let previous = -2
  for (const index of [...selected].sort((a, b) => a - b)) {
    if (index > previous + 1) chunks.push('\n---\n')
    chunks.push(lines[index])
    previous = index
  }
  return chunks.join('\n').slice(0, MAX_DOCUMENTATION_CHARS)
}

function normalizeNpmDocumentation(params: {
  packageName: string
  payload: unknown
  topic?: string
}): unknown {
  const packument = asRecord(params.payload)
  return compactObject({
    name: asString(packument.name) ?? params.packageName,
    topic: params.topic,
    excerpt: extractRelevantText(
      asString(packument.readme) ?? '',
      params.topic,
    ),
    npmUrl: `https://www.npmjs.com/package/${params.packageName}`,
    repository: normalizeRepository(packument.repository),
    homepage: asString(packument.homepage),
  })
}


function normalizePyPiProjectUrl(value: unknown): string | undefined {
  const url = asString(value)
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

function parsePythonDependencyNames(value: unknown): {
  count: number
  names: string[]
} {
  const entries = asArray(value).filter(
    (item): item is string => typeof item === 'string',
  )
  const names = new Set<string>()
  for (const entry of entries) {
    const match = entry.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/)
    if (match?.[1]) names.add(match[1])
  }
  return { count: entries.length, names: [...names].slice(0, 25) }
}

function latestPyPiStableVersion(payload: Record<string, unknown>): string | undefined {
  const releases = asRecord(payload.releases)
  const candidates = Object.entries(releases)
    .filter(([version, files]) => {
      if (isPrereleaseVersion(version)) return false
      const releaseFiles = asArray(files)
      return releaseFiles.some((file) => {
        const record = asRecord(file)
        return asBoolean(record.yanked) !== true
      })
    })
    .map(([version, files]) => {
      const timestamps = asArray(files)
        .map((file) => {
          const record = asRecord(file)
          return Date.parse(
            asString(record.upload_time_iso_8601) ??
              asString(record.upload_time) ??
              '',
          )
        })
        .filter(Number.isFinite)
      return {
        version,
        publishedAt: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      }
    })

  return candidates.sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) return b.publishedAt - a.publishedAt
    return compareSemverLike(b.version, a.version)
  })[0]?.version
}

function normalizePyPiFiles(value: unknown): unknown[] {
  return asArray(value)
    .slice(0, 12)
    .map((entry) => {
      const file = asRecord(entry)
      const digests = asRecord(file.digests)
      return compactObject({
        filename: asString(file.filename),
        packageType: asString(file.packagetype),
        pythonVersion: asString(file.python_version),
        requiresPython: asString(file.requires_python),
        size: asNumber(file.size),
        uploadedAt:
          asString(file.upload_time_iso_8601) ?? asString(file.upload_time),
        yanked: asBoolean(file.yanked),
        yankedReason: asString(file.yanked_reason),
        sha256: asString(digests.sha256),
        url: asString(file.url),
      })
    })
}

function normalizePyPiPackage(params: {
  packageName: string
  payload: unknown
  requestedVersion?: string
}): unknown {
  const root = asRecord(params.payload)
  const info = asRecord(root.info)
  const selectedVersion =
    asString(info.version) ?? params.requestedVersion ?? 'unknown'
  const projectUrls = asRecord(info.project_urls)
  const releases = asRecord(root.releases)
  const selectedReleaseFiles =
    asArray(root.urls).length > 0
      ? root.urls
      : releases[selectedVersion]
  const vulnerabilities = asArray(root.vulnerabilities)
    .slice(0, 10)
    .map((entry) => {
      const vulnerability = asRecord(entry)
      return compactObject({
        id: asString(vulnerability.id),
        aliases: asArray(vulnerability.aliases).slice(0, 10),
        summary: asString(vulnerability.summary),
        details: asString(vulnerability.details)?.slice(0, 1_500),
        fixedIn: asArray(vulnerability.fixed_in).slice(0, 10),
        link: asString(vulnerability.link),
      })
    })

  return compactObject({
    name: asString(info.name) ?? params.packageName,
    selectedVersion,
    selectedVersionIsPrerelease: isPrereleaseVersion(selectedVersion),
    latestPublishedVersion: asString(info.version),
    latestPublishedIsPrerelease: isPrereleaseVersion(asString(info.version)),
    latestStableVersion: latestPyPiStableVersion(root),
    summary: asString(info.summary),
    license:
      asString(info.license_expression) ?? asString(info.license)?.slice(0, 500),
    requiresPython: asString(info.requires_python),
    dependencies: parsePythonDependencyNames(info.requires_dist),
    classifiers: asArray(info.classifiers)
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 25),
    keywords: asString(info.keywords),
    author: asString(info.author),
    maintainer: asString(info.maintainer),
    homepage:
      normalizePyPiProjectUrl(info.home_page) ??
      normalizePyPiProjectUrl(projectUrls.Homepage),
    documentation:
      normalizePyPiProjectUrl(projectUrls.Documentation) ??
      normalizePyPiProjectUrl(projectUrls.Docs),
    repository:
      normalizePyPiProjectUrl(projectUrls.Repository) ??
      normalizePyPiProjectUrl(projectUrls.Source) ??
      normalizePyPiProjectUrl(projectUrls['Source Code']),
    changelog:
      normalizePyPiProjectUrl(projectUrls.Changelog) ??
      normalizePyPiProjectUrl(projectUrls.Changes),
    projectUrls: Object.fromEntries(
      Object.entries(projectUrls)
        .map(([label, value]) => [label, normalizePyPiProjectUrl(value)] as const)
        .filter((entry): entry is readonly [string, string] =>
          Boolean(entry[1]),
        )
        .slice(0, 12),
    ),
    files: normalizePyPiFiles(selectedReleaseFiles),
    vulnerabilityCount: vulnerabilities.length,
    vulnerabilities,
    pypiUrl: `${PYPI_ORIGIN}/project/${encodeURIComponent(params.packageName)}/`,
  })
}

function normalizePyPiDocumentation(params: {
  packageName: string
  payload: unknown
  topic?: string
}): unknown {
  const root = asRecord(params.payload)
  const info = asRecord(root.info)
  const projectUrls = asRecord(info.project_urls)
  return compactObject({
    name: asString(info.name) ?? params.packageName,
    version: asString(info.version),
    topic: params.topic,
    excerpt: extractRelevantText(asString(info.description) ?? '', params.topic),
    contentType: asString(info.description_content_type),
    documentation:
      normalizePyPiProjectUrl(projectUrls.Documentation) ??
      normalizePyPiProjectUrl(projectUrls.Docs),
    repository:
      normalizePyPiProjectUrl(projectUrls.Repository) ??
      normalizePyPiProjectUrl(projectUrls.Source) ??
      normalizePyPiProjectUrl(projectUrls['Source Code']),
    pypiUrl: `${PYPI_ORIGIN}/project/${encodeURIComponent(params.packageName)}/`,
  })
}

function normalizePyPiVersions(payload: unknown, limit: number): unknown {
  const root = asRecord(payload)
  const releases = asRecord(root.releases)
  const versions = Object.entries(releases)
    .map(([version, files]) => {
      const releaseFiles = asArray(files)
      const timestamps = releaseFiles
        .map((file) => {
          const record = asRecord(file)
          return asString(record.upload_time_iso_8601) ?? asString(record.upload_time)
        })
        .filter((item): item is string => Boolean(item))
        .sort()
      return compactObject({
        version,
        prerelease: isPrereleaseVersion(version),
        yanked:
          releaseFiles.length > 0 &&
          releaseFiles.every((file) => asBoolean(asRecord(file).yanked) === true),
        publishedAt: timestamps.at(-1),
        fileCount: releaseFiles.length,
      })
    })
    .sort((a, b) => {
      const aRecord = asRecord(a)
      const bRecord = asRecord(b)
      const aDate = Date.parse(asString(aRecord.publishedAt) ?? '')
      const bDate = Date.parse(asString(bRecord.publishedAt) ?? '')
      if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
        return bDate - aDate
      }
      return compareSemverLike(
        asString(bRecord.version) ?? '',
        asString(aRecord.version) ?? '',
      )
    })
    .slice(0, limit)

  return compactObject({
    latestPublishedVersion: asString(asRecord(root.info).version),
    latestStableVersion: latestPyPiStableVersion(root),
    versions,
  })
}

function compactGoItems(value: unknown, limit: number): unknown[] {
  return asArray(value)
    .slice(0, limit)
    .map((entry) => {
      const item = asRecord(entry)
      return compactObject({
        packagePath: asString(item.packagePath),
        modulePath: asString(item.modulePath),
        path: asString(item.path),
        version: asString(item.version),
        latestVersion: asString(item.latestVersion),
        commitTime: asString(item.commitTime),
        synopsis: asString(item.synopsis),
        name: asString(item.name),
        kind: asString(item.kind),
        parent: asString(item.parent),
        deprecated: asBoolean(item.deprecated),
        deprecationReason: asString(item.deprecationReason),
        retracted: asBoolean(item.retracted),
        retractionReason: asString(item.retractionReason),
        id: asString(item.id),
        summary: asString(item.summary),
        details: asString(item.details)?.slice(0, 1_500),
        aliases: asArray(item.aliases).slice(0, 10),
        affected: compactJsonPreview(item.affected, 2_000),
        references: compactJsonPreview(item.references, 1_000),
      })
    })
}

function normalizeGoSearch(payload: unknown, limit: number): unknown {
  const root = asRecord(payload)
  return compactObject({
    total: asNumber(root.total),
    nextPageToken: asString(root.nextPageToken),
    results: compactGoItems(root.items, limit),
  })
}

function normalizeGoPackage(payload: unknown, packagePath: string): unknown {
  const root = asRecord(payload)
  return compactObject({
    packagePath: asString(root.path) ?? packagePath,
    modulePath: asString(root.modulePath),
    version: asString(root.version),
    latest: asBoolean(root.isLatest),
    standardLibrary: asBoolean(root.isStandardLibrary),
    goos: asString(root.goos),
    goarch: asString(root.goarch),
    name: asString(root.name),
    synopsis: asString(root.synopsis),
    redistributable: asBoolean(root.isRedistributable),
    imports: asArray(root.imports)
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 30),
    licenses: compactJsonPreview(asArray(root.licenses).slice(0, 5), 1_500),
    pkgGoDevUrl: `${GO_PACKAGE_ORIGIN}/${packagePath}`,
  })
}

function normalizeGoDocumentation(params: {
  payload: unknown
  packagePath: string
  topic?: string
}): unknown {
  const root = asRecord(params.payload)
  const documentation =
    asString(root.documentation) ??
    asString(root.doc) ??
    asString(root.documentationMarkdown) ??
    ''
  return compactObject({
    packagePath: asString(root.path) ?? params.packagePath,
    modulePath: asString(root.modulePath),
    version: asString(root.version),
    synopsis: asString(root.synopsis),
    topic: params.topic,
    excerpt: extractRelevantText(documentation, params.topic),
    examples: compactJsonPreview(asArray(root.examples).slice(0, 5), 3_000),
    pkgGoDevUrl: `${GO_PACKAGE_ORIGIN}/${params.packagePath}`,
  })
}

function normalizeGoSymbols(payload: unknown, limit: number): unknown {
  const root = asRecord(payload)
  const symbols = asRecord(root.symbols)
  return compactObject({
    modulePath: asString(root.modulePath),
    version: asString(root.version),
    total: asNumber(symbols.total),
    nextPageToken: asString(symbols.nextPageToken),
    symbols: compactGoItems(symbols.items, limit),
  })
}

function normalizeGoPaged(payload: unknown, limit: number): unknown {
  const root = asRecord(payload)
  return compactObject({
    total: asNumber(root.total),
    nextPageToken: asString(root.nextPageToken),
    items: compactGoItems(root.items, limit),
  })
}

function validateInput(input: EcosystemLookupInput): void {
  const query = input.query?.trim()
  const packageName = input.package?.trim()
  const moduleName = input.module?.trim()

  if (input.operation === 'search' && !query) {
    throw new Error('query is required for ecosystem search.')
  }
  if (
    ['package', 'documentation', 'symbols', 'vulnerabilities'].includes(
      input.operation,
    ) &&
    !packageName
  ) {
    throw new Error(`package is required for ${input.operation}.`)
  }
  if (input.operation === 'versions' && !moduleName && !packageName) {
    throw new Error('module or package is required for versions.')
  }
  if (input.ecosystem === 'pypi' && input.operation === 'search') {
    throw new Error(
      'PyPI does not provide a structured full-text search API. Discover candidate project names with web_search restricted to pypi.org/project, then inspect each exact project with ecosystem_research operation=package.',
    )
  }
  if (input.ecosystem === 'pypi' && input.operation === 'symbols') {
    throw new Error(
      'PyPI does not expose Python symbols. Use the project documentation or published source after resolving the exact package version.',
    )
  }
  if (input.ecosystem === 'npm' && input.operation === 'symbols') {
    throw new Error(
      'npm symbol lookup is not available; inspect official docs or published package types instead.',
    )
  }
  if (input.ecosystem === 'npm' && input.operation === 'versions') {
    throw new Error(
      'npm versions are included in package metadata; use operation package.',
    )
  }
  if (input.ecosystem === 'npm' && input.operation === 'vulnerabilities') {
    throw new Error(
      'npm vulnerability checks require a dependency tree; use the project audit command instead.',
    )
  }
}

async function runNpmLookup(params: {
  input: EcosystemLookupInput
  fetch: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<{ sourceUrl: string; data: unknown }> {
  const { input } = params
  const limit = normalizeLimit(input.limit)

  if (input.operation === 'search') {
    const url = new URL('/-/v1/search', NPM_REGISTRY_ORIGIN)
    url.searchParams.set('text', input.query!.trim())
    url.searchParams.set('size', String(limit))
    const payload = await fetchJson({ ...params, url })
    return {
      sourceUrl: url.toString(),
      data: normalizeNpmSearch(payload, limit),
    }
  }

  const packageName = input.package!.trim()
  const url = new URL(
    `/${encodeURIComponent(packageName)}`,
    NPM_REGISTRY_ORIGIN,
  )
  const payload = await fetchJson({
    ...params,
    url,
    accept: 'application/json',
  })

  if (input.operation === 'documentation') {
    return {
      sourceUrl: url.toString(),
      data: normalizeNpmDocumentation({
        packageName,
        payload,
        topic: input.topic,
      }),
    }
  }

  return {
    sourceUrl: url.toString(),
    data: normalizeNpmPackage({
      packageName,
      payload,
      requestedVersion: input.version,
    }),
  }
}


async function runPyPiLookup(params: {
  input: EcosystemLookupInput
  fetch: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<{ sourceUrl: string; data: unknown }> {
  const { input } = params
  const packageName = input.package!.trim()
  const requestedVersion = input.version?.trim()
  const route = requestedVersion && requestedVersion !== 'latest'
    ? `/pypi/${encodeURIComponent(packageName)}/${encodeURIComponent(requestedVersion)}/json`
    : `/pypi/${encodeURIComponent(packageName)}/json`
  const url = new URL(route, PYPI_ORIGIN)
  const payload = await fetchJson({ ...params, url })

  if (input.operation === 'documentation') {
    return {
      sourceUrl: url.toString(),
      data: normalizePyPiDocumentation({
        packageName,
        payload,
        topic: input.topic,
      }),
    }
  }
  if (input.operation === 'versions') {
    return {
      sourceUrl: url.toString(),
      data: normalizePyPiVersions(payload, normalizeLimit(input.limit)),
    }
  }
  if (input.operation === 'vulnerabilities') {
    const normalized = asRecord(
      normalizePyPiPackage({ packageName, payload, requestedVersion }),
    )
    return {
      sourceUrl: url.toString(),
      data: compactObject({
        name: normalized.name,
        selectedVersion: normalized.selectedVersion,
        vulnerabilityCount: normalized.vulnerabilityCount,
        vulnerabilities: normalized.vulnerabilities,
        pypiUrl: normalized.pypiUrl,
      }),
    }
  }
  return {
    sourceUrl: url.toString(),
    data: normalizePyPiPackage({ packageName, payload, requestedVersion }),
  }
}

async function runGoLookup(params: {
  input: EcosystemLookupInput
  fetch: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<{ sourceUrl: string; data: unknown }> {
  const { input } = params
  const limit = normalizeLimit(input.limit)

  if (input.operation === 'search') {
    const url = new URL('/v1beta/search', GO_PACKAGE_ORIGIN)
    url.searchParams.set('q', input.query!.trim())
    url.searchParams.set('limit', String(limit))
    const payload = await fetchJson({ ...params, url })
    return {
      sourceUrl: url.toString(),
      data: normalizeGoSearch(payload, limit),
    }
  }

  const packagePath = input.package?.trim()
  const modulePath = input.module?.trim()
  const queryPath =
    input.operation === 'versions' ? (modulePath ?? packagePath!) : packagePath!
  const route =
    input.operation === 'package' || input.operation === 'documentation'
      ? 'package'
      : input.operation === 'vulnerabilities'
        ? 'vulns'
        : input.operation
  const url = new URL(
    `/v1beta/${route}/${encodePathSegments(queryPath)}`,
    GO_PACKAGE_ORIGIN,
  )

  if (input.version) url.searchParams.set('version', input.version)
  if (modulePath && input.operation !== 'versions') {
    url.searchParams.set('module', modulePath)
  }
  if (['symbols', 'versions', 'vulnerabilities'].includes(input.operation)) {
    url.searchParams.set('limit', String(limit))
  }
  if (input.operation === 'symbols' && input.topic?.trim()) {
    url.searchParams.set(
      'filter',
      `contains(name, ${JSON.stringify(input.topic.trim())})`,
    )
  }
  if (input.operation === 'package') {
    url.searchParams.set('imports', 'true')
    url.searchParams.set('licenses', 'true')
  }
  if (input.operation === 'documentation') {
    url.searchParams.set('doc', 'md')
    url.searchParams.set('examples', 'true')
  }

  const payload = await fetchJson({ ...params, url })
  if (input.operation === 'package') {
    return {
      sourceUrl: url.toString(),
      data: normalizeGoPackage(payload, packagePath!),
    }
  }
  if (input.operation === 'documentation') {
    return {
      sourceUrl: url.toString(),
      data: normalizeGoDocumentation({
        payload,
        packagePath: packagePath!,
        topic: input.topic,
      }),
    }
  }
  if (input.operation === 'symbols') {
    return {
      sourceUrl: url.toString(),
      data: normalizeGoSymbols(payload, limit),
    }
  }
  return {
    sourceUrl: url.toString(),
    data: normalizeGoPaged(payload, limit),
  }
}

export async function runEcosystemLookup(
  input: EcosystemLookupInput,
  options: {
    fetch?: typeof globalThis.fetch
    signal?: AbortSignal
    cacheDir?: string
    now?: Date
  } = {},
): Promise<EcosystemLookupResponse> {
  validateInput(input)
  const normalizedInput = {
    ...input,
    query: input.query?.trim(),
    package: input.package?.trim(),
    module: input.module?.trim(),
    version: input.version?.trim(),
    topic: input.topic?.trim(),
    limit: normalizeLimit(input.limit),
  }
  const key = buildCacheKey(normalizedInput)
  const now = options.now ?? new Date()

  if (!input.refresh) {
    const cached = loadEcosystemCache<Omit<EcosystemLookupResponse, 'cached'>>({
      key,
      cacheDir: options.cacheDir,
      now,
    })
    if (cached) return { ...cached.value, cached: true }
  }

  const fetchImpl = options.fetch ?? globalThis.fetch
  const lookup =
    input.ecosystem === 'npm'
      ? await runNpmLookup({
          input: normalizedInput,
          fetch: fetchImpl,
          signal: options.signal,
        })
      : input.ecosystem === 'pypi'
        ? await runPyPiLookup({
            input: normalizedInput,
            fetch: fetchImpl,
            signal: options.signal,
          })
        : await runGoLookup({
            input: normalizedInput,
            fetch: fetchImpl,
            signal: options.signal,
          })

  const value: Omit<EcosystemLookupResponse, 'cached'> = {
    ecosystem: input.ecosystem,
    operation: input.operation,
    sourceUrl: lookup.sourceUrl,
    fetchedAt: now.toISOString(),
    data: lookup.data,
  }
  saveEcosystemCache({
    key,
    value,
    ttlMs: getCacheTtlMs(normalizedInput),
    cacheDir: options.cacheDir,
    now,
  })

  return { ...value, cached: false }
}
