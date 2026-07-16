import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

import { getCodewolfHomeDir } from '../util/codewolf-home'

export interface EcosystemCacheEntry<T = unknown> {
  version: 1
  key: string
  createdAt: string
  expiresAt: string
  value: T
}

const CACHE_VERSION = 1 as const
const MAX_CACHE_FILES = 500

export function getEcosystemResearchCacheDir(
  configDir = getCodewolfHomeDir(),
): string {
  return path.join(configDir, 'research-cache', 'ecosystems')
}

function getCacheFilePath(key: string, cacheDir: string): string {
  const digest = createHash('sha256').update(key).digest('hex')
  return path.join(cacheDir, `${digest}.json`)
}

export function loadEcosystemCache<T>(params: {
  key: string
  cacheDir?: string
  now?: Date
}): EcosystemCacheEntry<T> | undefined {
  const cacheDir = params.cacheDir ?? getEcosystemResearchCacheDir()
  const filePath = getCacheFilePath(params.key, cacheDir)

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
      | EcosystemCacheEntry<T>
      | undefined
    if (
      parsed?.version !== CACHE_VERSION ||
      parsed.key !== params.key ||
      typeof parsed.expiresAt !== 'string'
    ) {
      return undefined
    }

    const now = params.now ?? new Date()
    if (Date.parse(parsed.expiresAt) <= now.getTime()) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        // Cache cleanup is best effort.
      }
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

function pruneCache(cacheDir: string): void {
  try {
    const files = fs
      .readdirSync(cacheDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const filePath = path.join(cacheDir, entry.name)
        return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const stale of files.slice(MAX_CACHE_FILES)) {
      try {
        fs.unlinkSync(stale.filePath)
      } catch {
        // Cache pruning is best effort.
      }
    }
  } catch {
    // Cache pruning must never fail research.
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
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
    const filePath = getCacheFilePath(params.key, cacheDir)
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tempPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    fs.renameSync(tempPath, filePath)
    try {
      fs.chmodSync(filePath, 0o600)
    } catch {
      // Windows does not enforce POSIX modes.
    }
    pruneCache(cacheDir)
  } catch {
    // Cache failures are non-fatal.
  }

  return entry
}
