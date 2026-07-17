import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getCodewolfHomeDir } from '@codebuff/common/util/codewolf-home'
import { isProtectedEnvFilePath } from '@codebuff/common/util/protected-env'

export const SSH_SERVERS_FILE_NAME = 'ssh-servers.json'
const SSH_SERVERS_FILE_VERSION = 1 as const

export type SshServerProfile = {
  id: string
  name?: string
  host: string
  port: number
  username: string
  password_env?: string
  password_vault?: boolean
  private_key_path?: string
  passphrase_env?: string
  passphrase_vault?: boolean
  agent?: string
  agent_env?: string
  host_fingerprint_sha256?: string
  ready_timeout_ms?: number
  keepalive_interval_ms?: number
  created_at: string
  updated_at: string
}

export type SshServerProfileInput = {
  name?: string
  host: string
  port?: number
  username: string
  password_env?: string
  password_vault?: boolean
  private_key_path?: string
  passphrase_env?: string
  passphrase_vault?: boolean
  agent?: string
  agent_env?: string
  host_fingerprint_sha256?: string
  ready_timeout_ms?: number
  keepalive_interval_ms?: number
}

export type SshServerProfilePatch = Partial<SshServerProfileInput> & {
  clear_name?: boolean
  clear_authentication?: boolean
}

type SshServersFile = {
  version: typeof SSH_SERVERS_FILE_VERSION
  servers: SshServerProfile[]
}

type UnknownRecord = Record<string, unknown>

function now(): string {
  return new Date().toISOString()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value)
  if (!normalized) throw new Error(`El campo ${field} es obligatorio.`)
  return normalized
}

function optionalInteger(
  value: unknown,
  options: { min: number; max: number },
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < options.min ||
    value > options.max
  ) {
    throw new Error(
      `Se esperaba un entero entre ${options.min} y ${options.max}.`,
    )
  }
  return value
}

function safePrivateKeyPath(value: unknown): string | undefined {
  const keyPath = optionalString(value)
  if (!keyPath) return undefined
  if (isProtectedEnvFilePath(keyPath)) {
    throw new Error(
      'A protected .env file cannot be saved as a private_key_path. Use a dedicated SSH key file.',
    )
  }
  return keyPath
}

function normalizedName(value: string | undefined): string | undefined {
  const name = optionalString(value)
  if (!name) return undefined
  if (name.length > 80) {
    throw new Error('El nombre del servidor no puede superar 80 caracteres.')
  }
  return name
}

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'server'
  )
}

function normalizeServerReference(value: string): string {
  return value.trim().replace(/^ssh-server:\/\//i, '')
}

function profileFromUnknown(value: unknown, index: number): SshServerProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`El servidor guardado en la posición ${index} no es válido.`)
  }
  const record = value as UnknownRecord
  const host = requiredString(record.host, 'host')
  const username = requiredString(record.username, 'username')
  const createdAt =
    optionalString(record.created_at) ?? optionalString(record.createdAt) ?? now()
  const updatedAt =
    optionalString(record.updated_at) ?? optionalString(record.updatedAt) ?? createdAt

  return {
    id:
      optionalString(record.id) ??
      optionalString(record.server_id) ??
      `server-${slug(host)}-${randomUUID().slice(0, 8)}`,
    ...(normalizedName(
      optionalString(record.name) ?? optionalString(record.label),
    )
      ? {
          name: normalizedName(
            optionalString(record.name) ?? optionalString(record.label),
          ),
        }
      : {}),
    host,
    port: optionalInteger(record.port, { min: 1, max: 65_535 }) ?? 22,
    username,
    ...(optionalString(record.password_env) || optionalString(record.passwordEnv)
      ? {
          password_env:
            optionalString(record.password_env) ??
            optionalString(record.passwordEnv),
        }
      : {}),
    ...(record.password_vault === true || record.passwordVault === true
      ? { password_vault: true }
      : {}),
    ...(safePrivateKeyPath(
      record.private_key_path ?? record.privateKeyPath,
    )
      ? {
          private_key_path: safePrivateKeyPath(
            record.private_key_path ?? record.privateKeyPath,
          ),
        }
      : {}),
    ...(optionalString(record.passphrase_env) ||
    optionalString(record.passphraseEnv)
      ? {
          passphrase_env:
            optionalString(record.passphrase_env) ??
            optionalString(record.passphraseEnv),
        }
      : {}),
    ...(record.passphrase_vault === true || record.passphraseVault === true
      ? { passphrase_vault: true }
      : {}),
    ...(optionalString(record.agent) ? { agent: optionalString(record.agent) } : {}),
    ...(optionalString(record.agent_env) || optionalString(record.agentEnv)
      ? {
          agent_env:
            optionalString(record.agent_env) ?? optionalString(record.agentEnv),
        }
      : {}),
    ...(optionalString(record.host_fingerprint_sha256) ||
    optionalString(record.hostFingerprintSha256)
      ? {
          host_fingerprint_sha256:
            optionalString(record.host_fingerprint_sha256) ??
            optionalString(record.hostFingerprintSha256),
        }
      : {}),
    ...(optionalInteger(
      record.ready_timeout_ms ?? record.readyTimeoutMs,
      { min: 1_000, max: 120_000 },
    )
      ? {
          ready_timeout_ms: optionalInteger(
            record.ready_timeout_ms ?? record.readyTimeoutMs,
            { min: 1_000, max: 120_000 },
          ),
        }
      : {}),
    ...(optionalInteger(
      record.keepalive_interval_ms ?? record.keepaliveIntervalMs,
      { min: 1_000, max: 120_000 },
    )
      ? {
          keepalive_interval_ms: optionalInteger(
            record.keepalive_interval_ms ?? record.keepaliveIntervalMs,
            { min: 1_000, max: 120_000 },
          ),
        }
      : {}),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

function normalizeInput(input: SshServerProfileInput): SshServerProfileInput {
  return {
    ...(normalizedName(input.name) ? { name: normalizedName(input.name) } : {}),
    host: requiredString(input.host, 'host'),
    port: optionalInteger(input.port ?? 22, { min: 1, max: 65_535 }) ?? 22,
    username: requiredString(input.username, 'username'),
    ...(optionalString(input.password_env)
      ? { password_env: optionalString(input.password_env) }
      : {}),
    ...(input.password_vault ? { password_vault: true } : {}),
    ...(safePrivateKeyPath(input.private_key_path)
      ? { private_key_path: safePrivateKeyPath(input.private_key_path) }
      : {}),
    ...(optionalString(input.passphrase_env)
      ? { passphrase_env: optionalString(input.passphrase_env) }
      : {}),
    ...(input.passphrase_vault ? { passphrase_vault: true } : {}),
    ...(optionalString(input.agent) ? { agent: optionalString(input.agent) } : {}),
    ...(optionalString(input.agent_env)
      ? { agent_env: optionalString(input.agent_env) }
      : {}),
    ...(optionalString(input.host_fingerprint_sha256)
      ? {
          host_fingerprint_sha256: optionalString(
            input.host_fingerprint_sha256,
          ),
        }
      : {}),
    ...(optionalInteger(input.ready_timeout_ms, { min: 1_000, max: 120_000 })
      ? {
          ready_timeout_ms: optionalInteger(input.ready_timeout_ms, {
            min: 1_000,
            max: 120_000,
          }),
        }
      : {}),
    ...(optionalInteger(input.keepalive_interval_ms, {
      min: 1_000,
      max: 120_000,
    })
      ? {
          keepalive_interval_ms: optionalInteger(input.keepalive_interval_ms, {
            min: 1_000,
            max: 120_000,
          }),
        }
      : {}),
  }
}

function sameEndpoint(
  profile: Pick<SshServerProfile, 'host' | 'port' | 'username'>,
  input: Pick<SshServerProfileInput, 'host' | 'port' | 'username'>,
): boolean {
  return (
    profile.host.toLowerCase() === input.host.toLowerCase() &&
    profile.port === (input.port ?? 22) &&
    profile.username.toLowerCase() === input.username.toLowerCase()
  )
}

export function getSshServersPath(
  configDir = getCodewolfHomeDir(),
): string {
  return path.join(configDir, SSH_SERVERS_FILE_NAME)
}

export function getSshServerDisplayName(
  profile: Pick<SshServerProfile, 'name' | 'host'>,
): string {
  return profile.name?.trim() || profile.host
}

export function compactSshServerProfile(
  profile: SshServerProfile,
): Record<string, unknown> {
  const authMethods = [
    profile.password_vault ? 'encrypted_password_vault' : undefined,
    profile.password_env ? 'password_env' : undefined,
    profile.private_key_path ? 'private_key_path' : undefined,
    profile.passphrase_vault ? 'encrypted_passphrase_vault' : undefined,
    profile.agent_env ? 'agent_env' : undefined,
    profile.agent ? 'agent' : undefined,
  ].filter(Boolean)

  return {
    server_id: profile.id,
    server_ref: `ssh-server://${profile.id}`,
    name: getSshServerDisplayName(profile),
    ...(profile.name ? { configured_name: profile.name } : {}),
    has_custom_name: Boolean(profile.name),
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authentication: authMethods.length > 0 ? authMethods : ['not_saved'],
    ...(profile.password_vault ? { password_saved: true } : {}),
    ...(profile.password_env ? { password_env: profile.password_env } : {}),
    ...(profile.private_key_path
      ? { private_key_path: profile.private_key_path }
      : {}),
    ...(profile.passphrase_vault ? { passphrase_saved: true } : {}),
    ...(profile.passphrase_env
      ? { passphrase_env: profile.passphrase_env }
      : {}),
    ...(profile.agent_env ? { agent_env: profile.agent_env } : {}),
    ...(profile.agent ? { agent_configured: true } : {}),
    ...(profile.host_fingerprint_sha256
      ? { host_fingerprint_sha256: profile.host_fingerprint_sha256 }
      : {}),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }
}

export class SshServerStore {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly configDir = getCodewolfHomeDir()) {}

  get filePath(): string {
    return getSshServersPath(this.configDir)
  }

  async list(): Promise<SshServerProfile[]> {
    return this.enqueue(async () => this.readServers())
  }

  async get(reference: string): Promise<SshServerProfile> {
    return this.enqueue(async () => {
      const servers = await this.readServers()
      return this.resolveFromList(servers, reference)
    })
  }

  async findByEndpoint(
    input: Pick<SshServerProfileInput, 'host' | 'port' | 'username'>,
  ): Promise<SshServerProfile | undefined> {
    return this.enqueue(async () => {
      const servers = await this.readServers()
      return servers.find((server) => sameEndpoint(server, input))
    })
  }

  async add(input: SshServerProfileInput): Promise<SshServerProfile> {
    return this.enqueue(async () => {
      const normalized = normalizeInput(input)
      const servers = await this.readServers()
      this.assertUniqueName(servers, normalized.name)
      const timestamp = now()
      const profile: SshServerProfile = {
        id: `server-${slug(normalized.name ?? normalized.host)}-${randomUUID().slice(0, 8)}`,
        ...normalized,
        port: normalized.port ?? 22,
        created_at: timestamp,
        updated_at: timestamp,
      }
      servers.push(profile)
      await this.writeServers(servers)
      return profile
    })
  }

  async update(
    reference: string,
    patch: SshServerProfilePatch,
  ): Promise<SshServerProfile> {
    return this.enqueue(async () => {
      const servers = await this.readServers()
      const current = this.resolveFromList(servers, reference)
      const index = servers.findIndex((server) => server.id === current.id)
      if (index < 0) throw new Error(`Servidor SSH no encontrado: ${reference}`)

      const nextName = patch.clear_name
        ? undefined
        : patch.name !== undefined
          ? normalizedName(patch.name)
          : current.name
      this.assertUniqueName(servers, nextName, current.id)

      const next: SshServerProfile = {
        ...current,
        ...(nextName ? { name: nextName } : {}),
        host:
          patch.host !== undefined
            ? requiredString(patch.host, 'host')
            : current.host,
        port:
          patch.port !== undefined
            ? optionalInteger(patch.port, { min: 1, max: 65_535 })!
            : current.port,
        username:
          patch.username !== undefined
            ? requiredString(patch.username, 'username')
            : current.username,
        updated_at: now(),
      }
      if (!nextName) delete next.name

      if (patch.clear_authentication) {
        delete next.password_env
        delete next.password_vault
        delete next.private_key_path
        delete next.passphrase_env
        delete next.passphrase_vault
        delete next.agent
        delete next.agent_env
      }

      for (const key of ['password_vault', 'passphrase_vault'] as const) {
        if (patch[key] !== undefined) {
          if (patch[key]) next[key] = true
          else delete next[key]
        }
      }

      for (const key of [
        'password_env',
        'private_key_path',
        'passphrase_env',
        'agent',
        'agent_env',
        'host_fingerprint_sha256',
      ] as const) {
        if (patch[key] !== undefined) {
          const value =
            key === 'private_key_path'
              ? safePrivateKeyPath(patch[key])
              : optionalString(patch[key])
          if (value) next[key] = value
          else delete next[key]
        }
      }

      for (const key of [
        'ready_timeout_ms',
        'keepalive_interval_ms',
      ] as const) {
        if (patch[key] !== undefined) {
          next[key] = optionalInteger(patch[key], {
            min: 1_000,
            max: 120_000,
          })
        }
      }

      servers[index] = next
      await this.writeServers(servers)
      return next
    })
  }

  async rename(
    reference: string,
    name: string | undefined,
  ): Promise<SshServerProfile> {
    return this.update(reference, name ? { name } : { clear_name: true })
  }

  async delete(reference: string): Promise<SshServerProfile> {
    return this.enqueue(async () => {
      const servers = await this.readServers()
      const current = this.resolveFromList(servers, reference)
      await this.writeServers(
        servers.filter((server) => server.id !== current.id),
      )
      return current
    })
  }

  async upsertByEndpoint(
    input: SshServerProfileInput,
  ): Promise<{ profile: SshServerProfile; created: boolean }> {
    return this.enqueue(async () => {
      const normalized = normalizeInput(input)
      const servers = await this.readServers()
      const existing = servers.find((server) => sameEndpoint(server, normalized))
      if (!existing) {
        this.assertUniqueName(servers, normalized.name)
        const timestamp = now()
        const profile: SshServerProfile = {
          id: `server-${slug(normalized.name ?? normalized.host)}-${randomUUID().slice(0, 8)}`,
          ...normalized,
          port: normalized.port ?? 22,
          created_at: timestamp,
          updated_at: timestamp,
        }
        servers.push(profile)
        await this.writeServers(servers)
        return { profile, created: true }
      }

      const index = servers.findIndex((server) => server.id === existing.id)
      const nextName = normalized.name ?? existing.name
      this.assertUniqueName(servers, nextName, existing.id)
      const profile: SshServerProfile = {
        ...existing,
        ...normalized,
        ...(nextName ? { name: nextName } : {}),
        port: normalized.port ?? existing.port,
        updated_at: now(),
      }
      servers[index] = profile
      await this.writeServers(servers)
      return { profile, created: false }
    })
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue
    let release!: () => void
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async readServers(): Promise<SshServerProfile[]> {
    let rawText: string
    try {
      rawText = await fs.readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch (error) {
      throw new Error(
        `El registro SSH está dañado (${this.filePath}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    let rawServers: unknown[]
    if (Array.isArray(parsed)) {
      // Legacy format: the root value was the server array itself.
      rawServers = parsed
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as UnknownRecord
      if (
        record.version !== undefined &&
        record.version !== SSH_SERVERS_FILE_VERSION
      ) {
        throw new Error(
          `Unsupported SSH server registry version: ${String(record.version)}`,
        )
      }
      if (!Array.isArray(record.servers)) {
        throw new Error(
          `The SSH server registry does not contain a valid servers array: ${this.filePath}`,
        )
      }
      rawServers = record.servers
    } else {
      throw new Error(`Invalid SSH server registry: ${this.filePath}`)
    }

    const servers = rawServers.map(profileFromUnknown)
    const uniqueIds = new Set<string>()
    for (const server of servers) {
      if (uniqueIds.has(server.id)) {
        throw new Error(`El registro SSH contiene un ID duplicado: ${server.id}`)
      }
      uniqueIds.add(server.id)
    }
    return servers
  }

  private async writeServers(servers: SshServerProfile[]): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const file: SshServersFile = {
      version: SSH_SERVERS_FILE_VERSION,
      servers,
    }
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, {
        mode: 0o600,
      })
      await fs.rename(tempPath, this.filePath)
      try {
        await fs.chmod(this.filePath, 0o600)
      } catch {
        // Windows does not enforce POSIX modes.
      }
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined)
    }
  }

  private resolveFromList(
    servers: SshServerProfile[],
    reference: string,
  ): SshServerProfile {
    const normalized = normalizeServerReference(reference)
    if (!normalized) throw new Error('server_id es obligatorio.')

    const byId = servers.find((server) => server.id === normalized)
    if (byId) return byId

    const lowered = normalized.toLowerCase()
    const byName = servers.filter(
      (server) => server.name?.toLowerCase() === lowered,
    )
    if (byName.length === 1) return byName[0]!
    if (byName.length > 1) {
      throw new Error(`El nombre SSH es ambiguo: ${reference}`)
    }

    const byHost = servers.filter(
      (server) =>
        server.host.toLowerCase() === lowered ||
        `${server.username}@${server.host}`.toLowerCase() === lowered ||
        `${server.host}:${server.port}`.toLowerCase() === lowered,
    )
    if (byHost.length === 1) return byHost[0]!
    if (byHost.length > 1) {
      throw new Error(
        `El host SSH es ambiguo: ${reference}. Usa server_id o el nombre configurado.`,
      )
    }

    throw new Error(`Servidor SSH configurado no encontrado: ${reference}`)
  }

  private assertUniqueName(
    servers: SshServerProfile[],
    name: string | undefined,
    ignoredId?: string,
  ): void {
    if (!name) return
    const duplicate = servers.find(
      (server) =>
        server.id !== ignoredId &&
        server.name?.toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      throw new Error(
        `Ya existe un servidor SSH con el nombre "${name}" (${duplicate.id}).`,
      )
    }
  }
}
