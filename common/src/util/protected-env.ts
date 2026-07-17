const SAFE_ENV_SUFFIXES = new Set([
  'example',
  'sample',
  'template',
  'dist',
  'defaults',
])

export function isProtectedEnvFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const basename = normalized.split('/').filter(Boolean).at(-1) ?? normalized
  if (basename === '.env' || basename === '.env*' || basename === '.env.*') {
    return true
  }
  if (!basename.startsWith('.env.')) return false
  const suffix = basename.slice('.env.'.length)
  return !SAFE_ENV_SUFFIXES.has(suffix)
}

export function findProtectedEnvFilePath(input: unknown): string | undefined {
  const visit = (value: unknown, depth: number): string | undefined => {
    if (depth > 4) return undefined
    if (typeof value === 'string') {
      const candidates = value
        .split(/[\s,'"`()\[\]{}=<>|&;]+/)
        .map((part) => part.replace(/^[!:]+|[;:]+$/g, ''))
      return candidates.find(isProtectedEnvFilePath)
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const match = visit(entry, depth + 1)
        if (match) return match
      }
      return undefined
    }
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const match = visit(entry, depth + 1)
        if (match) return match
      }
    }
    return undefined
  }
  return visit(input, 0)
}

export function inputMentionsProtectedEnv(input: unknown): boolean {
  return findProtectedEnvFilePath(input) !== undefined
}

/**
 * Returns true only when a tool can expose protected environment-file contents.
 * Metadata-only navigation (list/stat/glob) and blind writes do not count as a
 * read. Unknown/external tools remain conservative because their behavior is
 * not controlled by the SDK.
 */
export function toolMayReadProtectedEnv(params: {
  toolName: string
  input: unknown
  externalTool?: boolean
}): boolean {
  const { toolName, input, externalTool } = params
  if (!inputMentionsProtectedEnv(input)) return false
  if (externalTool) return true

  if (!input || typeof input !== 'object') return true
  const record = input as Record<string, unknown>

  if (toolName === 'ssh_remote') {
    const action = typeof record.action === 'string' ? record.action : ''
    if (action === 'connect' || action === 'connect_server') {
      return (
        typeof record.private_key_path === 'string' &&
        isProtectedEnvFilePath(record.private_key_path)
      )
    }
    if (action === 'read_file') {
      return (
        typeof record.path === 'string' && isProtectedEnvFilePath(record.path)
      )
    }
    if (action === 'download') {
      return (
        typeof record.remote_path === 'string' &&
        isProtectedEnvFilePath(record.remote_path)
      )
    }
    if (action === 'upload') {
      return (
        typeof record.local_path === 'string' &&
        isProtectedEnvFilePath(record.local_path)
      )
    }
    return action === 'exec' || action === 'shell_write'
  }

  if (toolName === 'write_file') return false
  if (toolName === 'list_directory' || toolName === 'glob') return false

  return true
}
