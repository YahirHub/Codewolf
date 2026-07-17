import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import posixPath from 'node:path/posix'

import { Client } from 'ssh2'

import type { SshRemoteAction } from '@codebuff/common/tools/params/tool/ssh-remote'
import type { RequestSecretFn } from '@codebuff/common/types/secret-prompt'
import { normalizeJsonValue } from '@codebuff/common/util/json'

import {
  SshServerStore,
  compactSshServerProfile,
  getSshServerDisplayName,
} from './ssh-server-store'
import { SshCredentialVault } from './ssh-credential-vault'

import type {
  SshServerProfile,
  SshServerProfileInput,
  SshServerProfilePatch,
} from './ssh-server-store'

import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type {
  ClientChannel,
  ConnectConfig,
  FileEntry,
  SFTPWrapper,
  Stats,
} from 'ssh2'

export type SshRemoteInput = {
  action: SshRemoteAction
  connection_id?: string
  server_id?: string
  name?: string
  label?: string
  new_name?: string
  clear_name?: boolean
  clear_authentication?: boolean
  close_connections?: boolean
  prompt_password?: boolean
  prompt_passphrase?: boolean
  save_server?: boolean
  host?: string
  port?: number
  username?: string
  password?: string
  password_env?: string
  private_key_path?: string
  private_key?: string
  passphrase?: string
  passphrase_env?: string
  agent?: string
  agent_env?: string
  host_fingerprint_sha256?: string
  ready_timeout_ms?: number
  keepalive_interval_ms?: number
  path?: string
  destination_path?: string
  local_path?: string
  remote_path?: string
  content?: string
  encoding?: 'utf8' | 'base64'
  command?: string
  timeout_seconds?: number
  pty?: boolean
  cols?: number
  rows?: number
  wait_ms?: number
  max_bytes?: number
  recursive?: boolean
  overwrite?: boolean
  reason?: string
}

type ShellState = {
  channel: ClientChannel
  stdout: string
  stderr: string
  closed: boolean
}

type ConnectionState = {
  id: string
  name: string
  serverId?: string
  host: string
  port: number
  username: string
  client: Client
  cwd: string
  connectedAt: string
  lastUsedAt: string
  sftp?: SFTPWrapper
  shell?: ShellState
  closed: boolean
  lastError?: string
  operationQueue: Promise<void>
}

export type SshRemoteManagerOptions = {
  clientFactory?: () => Client
  configDir?: string
  credentialVault?: SshCredentialVault
}

export type SshRemoteExecutionContext = {
  projectRoot?: string
  env?: Record<string, string>
  requestSecret?: RequestSecretFn
}

const MAX_SHELL_BUFFER = 2_000_000
const DEFAULT_MAX_BYTES = 200_000
const DEFAULT_TIMEOUT_SECONDS = 30

const POSIX_FILE_TYPE_MASK = 0o170000
const POSIX_DIRECTORY = 0o040000
const POSIX_SYMLINK = 0o120000

function entryType(mode: number): 'directory' | 'symlink' | 'file' {
  const type = mode & POSIX_FILE_TYPE_MASK
  if (type === POSIX_DIRECTORY) return 'directory'
  if (type === POSIX_SYMLINK) return 'symlink'
  return 'file'
}
const READ_ONLY_ACTIONS = new Set<SshRemoteAction>([
  'list_servers',
  'get_server',
  'vault_status',
  'lock_vault',
  'list_connections',
  'status',
  'pwd',
  'cd',
  'list',
  'stat',
  'read_file',
  'shell_read',
  'close',
  'close_all',
])

export function isSshRemoteSensitiveAction(action: SshRemoteAction): boolean {
  return !READ_ONLY_ACTIONS.has(action)
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

function localPath(projectRoot: string | undefined, value: string): string {
  const expanded = expandHome(value)
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(projectRoot ?? process.cwd(), expanded)
}

export function resolveRemotePath(cwd: string, value: string): string {
  if (value.startsWith('/')) return posixPath.normalize(value)
  return posixPath.normalize(posixPath.join(cwd || '.', value))
}

export function normalizeSshConnectionId(value: string): string {
  return value.trim().replace(/^ssh:\/\//i, '')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function now(): string {
  return new Date().toISOString()
}

function compactConnection(
  connection: ConnectionState,
): Record<string, unknown> {
  return {
    connection_id: connection.id,
    connection_ref: `ssh://${connection.id}`,
    name: connection.name,
    label: connection.name,
    ...(connection.serverId
      ? {
          server_id: connection.serverId,
          server_ref: `ssh-server://${connection.serverId}`,
        }
      : {}),
    host: connection.host,
    port: connection.port,
    username: connection.username,
    cwd: connection.cwd,
    shell_open: Boolean(connection.shell && !connection.shell.closed),
    connected_at: connection.connectedAt,
    last_used_at: connection.lastUsedAt,
    connected: !connection.closed,
    ...(connection.lastError ? { last_error: connection.lastError } : {}),
  }
}

function trimOutput(
  value: string,
  maxBytes: number,
): {
  value: string
  truncated: boolean
} {
  const bytes = Buffer.from(value)
  if (bytes.length <= maxBytes) return { value, truncated: false }
  return {
    value: bytes.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  }
}

function sftpCall<T>(
  executor: (
    callback: (error: Error | undefined | null, value: T) => void,
  ) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    executor((error, value) => {
      if (error) reject(error)
      else resolve(value)
    })
  })
}

function sftpVoid(
  executor: (callback: (error?: Error | null) => void) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    executor((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export class PersistentSshManager {
  private readonly connections = new Map<string, ConnectionState>()
  private readonly serverStore: SshServerStore
  private readonly credentialVault: SshCredentialVault
  private sequence = 0

  constructor(private readonly options: SshRemoteManagerOptions = {}) {
    this.serverStore = new SshServerStore(options.configDir)
    this.credentialVault =
      options.credentialVault ?? new SshCredentialVault(options.configDir)
  }

  async execute(
    input: SshRemoteInput,
    signal?: AbortSignal,
    context: SshRemoteExecutionContext = {},
  ): Promise<ToolResultOutput[]> {
    if (signal?.aborted) {
      return json({ errorMessage: 'SSH action cancelled before execution.' })
    }

    try {
      switch (input.action) {
        case 'connect':
          return json(await this.connect(input, signal, context))
        case 'connect_server':
          return json(await this.connectServer(input, signal, context))
        case 'list_servers':
          return json(await this.listServers())
        case 'get_server':
          return json(await this.getServer(input.server_id!))
        case 'add_server':
          return json(await this.addServer(input, signal, context))
        case 'update_server':
          return json(await this.updateServer(input, signal, context))
        case 'rename_server':
          return json(await this.renameServer(input))
        case 'delete_server':
          return json(await this.deleteServer(input, signal, context))
        case 'vault_status':
          return json({ action: 'vault_status', ...(await this.credentialVault.status()) })
        case 'unlock_vault':
          await this.credentialVault.unlock({
            requestSecret: context.requestSecret,
            signal,
          })
          return json({
            ok: true,
            action: 'unlock_vault',
            ...(await this.credentialVault.status()),
            message: 'La bóveda SSH quedó desbloqueada solo para esta ejecución de Codewolf.',
          })
        case 'lock_vault':
          await this.credentialVault.lock()
          return json({
            ok: true,
            action: 'lock_vault',
            ...(await this.credentialVault.status()),
            message: 'La clave de la bóveda SSH fue eliminada de la memoria del proceso.',
          })
        case 'change_vault_password':
          await this.credentialVault.changeMasterPassword({
            requestSecret: context.requestSecret,
            signal,
          })
          return json({
            ok: true,
            action: 'change_vault_password',
            ...(await this.credentialVault.status()),
            message: 'La bóveda SSH fue cifrada nuevamente con la nueva contraseña maestra.',
          })
        case 'set_server_password':
          return json(await this.setServerSecret(input.server_id!, 'password', signal, context))
        case 'clear_server_password':
          return json(await this.clearServerSecret(input.server_id!, 'password', signal, context))
        case 'set_server_passphrase':
          return json(await this.setServerSecret(input.server_id!, 'passphrase', signal, context))
        case 'clear_server_passphrase':
          return json(await this.clearServerSecret(input.server_id!, 'passphrase', signal, context))
        case 'list_connections':
          return json({
            connections: [...this.connections.values()].map(compactConnection),
            count: this.connections.size,
          })
        case 'close_all':
          return json(await this.closeAll())
        default: {
          const connection = this.getConnection(input.connection_id)
          return json(
            await this.enqueueConnectionOperation(connection, async () => {
              connection.lastUsedAt = now()
              return this.executeForConnection(
                connection,
                input,
                signal,
                context,
              )
            }),
          )
        }
      }
    } catch (error) {
      return json({
        action: input.action,
        connection_id: input.connection_id,
        server_id: input.server_id,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private getConnection(id: string | undefined): ConnectionState {
    if (!id) throw new Error('connection_id is required')
    const normalizedId = normalizeSshConnectionId(id)
    if (!normalizedId) throw new Error('connection_id is required')
    const connection = this.connections.get(normalizedId)
    if (!connection || connection.closed) {
      throw new Error(`SSH connection not found or closed: ${normalizedId}`)
    }
    return connection
  }

  private async enqueueConnectionOperation<T>(
    connection: ConnectionState,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = connection.operationQueue
    let release!: () => void
    connection.operationQueue = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous.catch(() => undefined)
    try {
      if (connection.closed) {
        throw new Error(`SSH connection not found or closed: ${connection.id}`)
      }
      return await operation()
    } finally {
      release()
    }
  }

  private activeConnectionsForServer(serverId: string): ConnectionState[] {
    return [...this.connections.values()].filter(
      (connection) => !connection.closed && connection.serverId === serverId,
    )
  }

  private compactConfiguredServer(
    profile: SshServerProfile,
  ): Record<string, unknown> {
    const activeConnections = this.activeConnectionsForServer(profile.id)
    return {
      ...compactSshServerProfile(profile),
      persistent: true,
      connected: activeConnections.length > 0,
      active_connection_count: activeConnections.length,
      active_connections: activeConnections.map((connection) => ({
        connection_id: connection.id,
        connection_ref: `ssh://${connection.id}`,
        cwd: connection.cwd,
        shell_open: Boolean(connection.shell && !connection.shell.closed),
      })),
    }
  }

  private vaultContext(
    profile: Pick<SshServerProfile, 'name' | 'host'> | undefined,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ) {
    return {
      requestSecret: context.requestSecret,
      signal,
      ...(profile ? { serverName: getSshServerDisplayName(profile) } : {}),
    }
  }

  private async requestSshSecret(
    field: 'password' | 'passphrase',
    profile: Pick<SshServerProfile, 'name' | 'host'>,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<string> {
    if (!context.requestSecret) {
      throw new Error(
        'Codewolf necesita un controlador local de entrada secreta para solicitar credenciales SSH sin mostrarlas al agente.',
      )
    }
    const serverName = getSshServerDisplayName(profile)
    const response = await context.requestSecret(
      {
        requestId: randomUUID(),
        kind: field === 'password' ? 'ssh-password' : 'ssh-passphrase',
        title:
          field === 'password'
            ? 'Contraseña del servidor SSH'
            : 'Passphrase de la clave SSH',
        message:
          field === 'password'
            ? 'Introduce la contraseña SSH que se guardará cifrada. El agente no recibirá este valor.'
            : 'Introduce la passphrase de la clave privada. Se guardará cifrada y el agente no recibirá este valor.',
        serverName,
        minLength: 1,
      },
      signal,
    )
    if (response.cancelled || response.value === undefined) {
      throw new Error('El usuario canceló la entrada de la credencial SSH.')
    }
    if (!response.value) throw new Error('La credencial SSH no puede estar vacía.')
    return response.value
  }

  private async setServerSecret(
    reference: string,
    field: 'password' | 'passphrase',
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    const profile = await this.serverStore.get(reference)
    const secret = await this.requestSshSecret(field, profile, signal, context)
    try {
      await this.credentialVault.setServerSecrets(
        profile.id,
        field === 'password' ? { password: secret } : { passphrase: secret },
        this.vaultContext(profile, signal, context),
      )
    } finally {
      // JavaScript strings cannot be zeroed reliably; keep their lifetime scoped
      // to this call and never include them in tool output or persistent logs.
    }
    const updated = await this.serverStore.update(
      profile.id,
      field === 'password'
        ? { password_vault: true }
        : { passphrase_vault: true },
    )
    return {
      ok: true,
      action:
        field === 'password' ? 'set_server_password' : 'set_server_passphrase',
      ...this.compactConfiguredServer(updated),
      vault: await this.credentialVault.status(),
      message:
        field === 'password'
          ? 'La contraseña SSH fue guardada en la bóveda cifrada.'
          : 'La passphrase SSH fue guardada en la bóveda cifrada.',
    }
  }

  private async clearServerSecret(
    reference: string,
    field: 'password' | 'passphrase',
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    const profile = await this.serverStore.get(reference)
    const configured =
      field === 'password' ? profile.password_vault : profile.passphrase_vault
    if (configured) {
      await this.credentialVault.clearServerSecret(
        profile.id,
        field,
        this.vaultContext(profile, signal, context),
      )
    }
    const updated = await this.serverStore.update(
      profile.id,
      field === 'password'
        ? { password_vault: false }
        : { passphrase_vault: false },
    )
    return {
      ok: true,
      action:
        field === 'password'
          ? 'clear_server_password'
          : 'clear_server_passphrase',
      ...this.compactConfiguredServer(updated),
      message:
        field === 'password'
          ? 'La contraseña cifrada del servidor fue eliminada.'
          : 'La passphrase cifrada del servidor fue eliminada.',
    }
  }

  private async listServers(): Promise<Record<string, unknown>> {
    const configured = await this.serverStore.list()
    const unconfiguredActive = [...this.connections.values()]
      .filter((connection) => !connection.closed && !connection.serverId)
      .map((connection) => ({
        name: connection.name || connection.host,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        persistent: false,
        connected: true,
        connection_id: connection.id,
        connection_ref: `ssh://${connection.id}`,
      }))

    return {
      action: 'list_servers',
      registry_path: this.serverStore.filePath,
      credential_vault: await this.credentialVault.status(),
      servers: configured.map((profile) =>
        this.compactConfiguredServer(profile),
      ),
      configured_count: configured.length,
      active_unconfigured_servers: unconfiguredActive,
      active_unconfigured_count: unconfiguredActive.length,
      message:
        configured.length > 0
          ? 'Configured SSH servers loaded from the global Codewolf registry.'
          : 'No configured SSH servers were found. Use add_server or connect with save_server=true.',
    }
  }

  private async getServer(reference: string): Promise<Record<string, unknown>> {
    const profile = await this.serverStore.get(reference)
    return {
      action: 'get_server',
      ...this.compactConfiguredServer(profile),
      credential_vault: await this.credentialVault.status(),
    }
  }

  private persistentPrivateKeyPath(
    projectRoot: string | undefined,
    value: string | undefined,
  ): string | undefined {
    if (!value) return undefined
    if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
      return value
    }
    return localPath(projectRoot, value)
  }

  private profileInputFromTool(
    input: SshRemoteInput,
    context: SshRemoteExecutionContext,
  ): SshServerProfileInput {
    return {
      ...(input.name?.trim() || input.label?.trim()
        ? { name: input.name?.trim() || input.label?.trim() }
        : {}),
      host: input.host!,
      port: input.port ?? 22,
      username: input.username!,
      ...(input.password_env ? { password_env: input.password_env } : {}),
      ...(input.private_key_path
        ? {
            private_key_path: this.persistentPrivateKeyPath(
              context.projectRoot,
              input.private_key_path,
            ),
          }
        : {}),
      ...(input.passphrase_env
        ? { passphrase_env: input.passphrase_env }
        : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.agent_env ? { agent_env: input.agent_env } : {}),
      ...(input.host_fingerprint_sha256
        ? { host_fingerprint_sha256: input.host_fingerprint_sha256 }
        : {}),
      ...(input.ready_timeout_ms
        ? { ready_timeout_ms: input.ready_timeout_ms }
        : {}),
      ...(input.keepalive_interval_ms
        ? { keepalive_interval_ms: input.keepalive_interval_ms }
        : {}),
    }
  }

  private profilePatchFromTool(
    input: SshRemoteInput,
    context: SshRemoteExecutionContext,
  ): SshServerProfilePatch {
    return {
      ...(input.name !== undefined || input.label !== undefined
        ? { name: input.name?.trim() || input.label?.trim() }
        : {}),
      ...(input.host !== undefined ? { host: input.host } : {}),
      ...(input.port !== undefined ? { port: input.port } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.password_env !== undefined
        ? { password_env: input.password_env }
        : {}),
      ...(input.private_key_path !== undefined
        ? {
            private_key_path: this.persistentPrivateKeyPath(
              context.projectRoot,
              input.private_key_path,
            ),
          }
        : {}),
      ...(input.passphrase_env !== undefined
        ? { passphrase_env: input.passphrase_env }
        : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(input.agent_env !== undefined
        ? { agent_env: input.agent_env }
        : {}),
      ...(input.host_fingerprint_sha256 !== undefined
        ? { host_fingerprint_sha256: input.host_fingerprint_sha256 }
        : {}),
      ...(input.ready_timeout_ms !== undefined
        ? { ready_timeout_ms: input.ready_timeout_ms }
        : {}),
      ...(input.keepalive_interval_ms !== undefined
        ? { keepalive_interval_ms: input.keepalive_interval_ms }
        : {}),
      ...(input.clear_name ? { clear_name: true } : {}),
      ...(input.clear_authentication ? { clear_authentication: true } : {}),
    }
  }

  private assertNoPersistentLiteralSecrets(input: SshRemoteInput): void {
    if (
      input.password !== undefined ||
      input.private_key !== undefined ||
      input.passphrase !== undefined
    ) {
      throw new Error(
        'Literal passwords, private keys, and passphrases cannot be saved. Use password_env, private_key_path, passphrase_env, or agent_env.',
      )
    }
  }

  private async addServer(
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    this.assertNoPersistentLiteralSecrets(input)
    const profile = await this.serverStore.add(
      this.profileInputFromTool(input, context),
    )
    try {
      if (input.prompt_password) {
        await this.setServerSecret(profile.id, 'password', signal, context)
      }
      if (input.prompt_passphrase) {
        await this.setServerSecret(profile.id, 'passphrase', signal, context)
      }
    } catch (error) {
      await this.credentialVault
        .deleteServerSecrets(
          profile.id,
          this.vaultContext(profile, signal, context),
        )
        .catch(() => undefined)
      await this.serverStore.delete(profile.id).catch(() => undefined)
      throw error
    }
    const saved = await this.serverStore.get(profile.id)
    return {
      ok: true,
      action: 'add_server',
      ...this.compactConfiguredServer(saved),
      message: 'SSH server saved globally and is now reusable from every project.',
    }
  }

  private async updateServer(
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    this.assertNoPersistentLiteralSecrets(input)
    const current = await this.serverStore.get(input.server_id!)
    if (input.clear_authentication && (current.password_vault || current.passphrase_vault)) {
      await this.credentialVault.deleteServerSecrets(
        current.id,
        this.vaultContext(current, signal, context),
      )
    }
    let profile = await this.serverStore.update(
      current.id,
      this.profilePatchFromTool(input, context),
    )
    if (input.prompt_password) {
      await this.setServerSecret(profile.id, 'password', signal, context)
      profile = await this.serverStore.get(profile.id)
    }
    if (input.prompt_passphrase) {
      await this.setServerSecret(profile.id, 'passphrase', signal, context)
      profile = await this.serverStore.get(profile.id)
    }
    for (const connection of this.activeConnectionsForServer(profile.id)) {
      connection.name = getSshServerDisplayName(profile)
    }
    return {
      ok: true,
      action: 'update_server',
      ...this.compactConfiguredServer(profile),
      message: 'SSH server configuration updated.',
    }
  }

  private async renameServer(
    input: SshRemoteInput,
  ): Promise<Record<string, unknown>> {
    const requestedName =
      input.new_name?.trim() || input.name?.trim() || input.label?.trim()
    const profile = await this.serverStore.rename(
      input.server_id!,
      input.clear_name ? undefined : requestedName,
    )
    for (const connection of this.activeConnectionsForServer(profile.id)) {
      connection.name = getSshServerDisplayName(profile)
    }
    return {
      ok: true,
      action: 'rename_server',
      ...this.compactConfiguredServer(profile),
      message: profile.name
        ? 'SSH server renamed.'
        : 'Custom SSH server name removed; the host is now used as its display name.',
    }
  }

  private async deleteServer(
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    const existing = await this.serverStore.get(input.server_id!)
    if (existing.password_vault || existing.passphrase_vault) {
      await this.credentialVault.deleteServerSecrets(
        existing.id,
        this.vaultContext(existing, signal, context),
      )
    }
    const profile = await this.serverStore.delete(existing.id)
    const activeConnections = this.activeConnectionsForServer(profile.id)
    const closedConnectionIds: string[] = []
    for (const connection of activeConnections) {
      if (input.close_connections) {
        closedConnectionIds.push(connection.id)
        this.close(connection)
      } else {
        connection.serverId = undefined
      }
    }
    return {
      ok: true,
      action: 'delete_server',
      deleted_server: compactSshServerProfile(profile),
      encrypted_credentials_deleted: Boolean(
        existing.password_vault || existing.passphrase_vault,
      ),
      closed_connection_ids: closedConnectionIds,
      active_connections_kept: input.close_connections
        ? 0
        : activeConnections.length,
      message: input.close_connections
        ? 'Saved SSH server, encrypted credentials, and active connections were closed.'
        : 'Saved SSH server and encrypted credentials removed. Existing active connections remain open until explicitly closed.',
    }
  }

  private async connectServer(
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    let profile = await this.serverStore.get(input.server_id!)
    const hasAuthenticationOverride = Boolean(
      input.password !== undefined ||
        input.password_env !== undefined ||
        input.private_key !== undefined ||
        input.private_key_path !== undefined ||
        input.agent !== undefined ||
        input.agent_env !== undefined ||
        input.prompt_password,
    )

    let vaultPassword: string | undefined
    let vaultPassphrase: string | undefined
    if (!hasAuthenticationOverride && (profile.password_vault || profile.passphrase_vault)) {
      const secrets = await this.credentialVault.getServerSecrets(
        profile.id,
        this.vaultContext(profile, signal, context),
      )
      if (profile.password_vault && !secrets?.password) {
        throw new Error(
          `El perfil ${getSshServerDisplayName(profile)} indica una contraseña cifrada, pero la bóveda no contiene esa credencial.`,
        )
      }
      if (profile.passphrase_vault && !secrets?.passphrase) {
        throw new Error(
          `El perfil ${getSshServerDisplayName(profile)} indica una passphrase cifrada, pero la bóveda no contiene esa credencial.`,
        )
      }
      vaultPassword = secrets?.password
      vaultPassphrase = secrets?.passphrase
    }

    const profileHasAuthentication = Boolean(
      profile.password_env ||
        profile.password_vault ||
        profile.private_key_path ||
        profile.agent ||
        profile.agent_env,
    )
    let promptedPassword: string | undefined
    let promptedPassphrase: string | undefined
    if (input.prompt_password || (!hasAuthenticationOverride && !profileHasAuthentication)) {
      promptedPassword = await this.requestSshSecret(
        'password',
        profile,
        signal,
        context,
      )
    }
    if (input.prompt_passphrase) {
      promptedPassphrase = await this.requestSshSecret(
        'passphrase',
        profile,
        signal,
        context,
      )
    }

    const result = await this.connect(
      {
        ...input,
        action: 'connect',
        server_id: profile.id,
        save_server: false,
        prompt_password: false,
        prompt_passphrase: false,
        name: getSshServerDisplayName(profile),
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: input.password ?? promptedPassword ?? vaultPassword,
        password_env: hasAuthenticationOverride
          ? input.password_env
          : profile.password_env,
        private_key_path: hasAuthenticationOverride
          ? input.private_key_path
          : profile.private_key_path,
        passphrase:
          input.passphrase ?? promptedPassphrase ?? vaultPassphrase,
        passphrase_env:
          input.passphrase !== undefined || promptedPassphrase || vaultPassphrase
            ? undefined
            : input.passphrase_env ?? profile.passphrase_env,
        agent: hasAuthenticationOverride ? input.agent : profile.agent,
        agent_env: hasAuthenticationOverride
          ? input.agent_env
          : profile.agent_env,
        host_fingerprint_sha256:
          input.host_fingerprint_sha256 ?? profile.host_fingerprint_sha256,
        ready_timeout_ms:
          input.ready_timeout_ms ?? profile.ready_timeout_ms,
        keepalive_interval_ms:
          input.keepalive_interval_ms ?? profile.keepalive_interval_ms,
      },
      signal,
      context,
      profile.id,
    )

    let credentialSaveError: string | undefined
    let promptedCredentialsSaved = false
    if (promptedPassword || promptedPassphrase) {
      try {
        await this.credentialVault.setServerSecrets(
          profile.id,
          {
            ...(promptedPassword ? { password: promptedPassword } : {}),
            ...(promptedPassphrase ? { passphrase: promptedPassphrase } : {}),
          },
          this.vaultContext(profile, signal, context),
        )
        profile = await this.serverStore.update(profile.id, {
          ...(promptedPassword ? { password_vault: true } : {}),
          ...(promptedPassphrase ? { passphrase_vault: true } : {}),
        })
        promptedCredentialsSaved = true
      } catch (error) {
        credentialSaveError = error instanceof Error ? error.message : String(error)
      }
    }

    return {
      ...result,
      action: 'connect_server',
      server: compactSshServerProfile(profile),
      ...(promptedPassword || promptedPassphrase
        ? { prompted_credentials_saved: promptedCredentialsSaved }
        : {}),
      ...(credentialSaveError
        ? {
            credential_save_error: credentialSaveError,
            message:
              'La conexión SSH quedó abierta, pero la credencial solicitada no pudo guardarse en la bóveda cifrada.',
          }
        : {}),
    }
  }

  private async connect(
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
    linkedServerId?: string,
  ): Promise<Record<string, unknown>> {
    const host = input.host!
    const port = input.port ?? 22
    const username = input.username!
    const env = { ...process.env, ...(context.env ?? {}) }
    const displayProfile = {
      ...(input.name?.trim() || input.label?.trim()
        ? { name: input.name?.trim() || input.label?.trim() }
        : {}),
      host,
    }
    const promptedPassword =
      input.prompt_password && input.password === undefined
        ? await this.requestSshSecret(
            'password',
            displayProfile,
            signal,
            context,
          )
        : undefined
    const promptedPassphrase =
      input.prompt_passphrase && input.passphrase === undefined
        ? await this.requestSshSecret(
            'passphrase',
            displayProfile,
            signal,
            context,
          )
        : undefined
    const password = input.password_env
      ? env[input.password_env]
      : input.password ?? promptedPassword
    const passphrase = input.passphrase_env
      ? env[input.passphrase_env]
      : input.passphrase ?? promptedPassphrase
    const agent = input.agent_env ? env[input.agent_env] : input.agent

    if (input.password_env && !password) {
      throw new Error(
        `Environment variable ${input.password_env} is empty or unavailable.`,
      )
    }
    if (input.passphrase_env && !passphrase) {
      throw new Error(
        `Environment variable ${input.passphrase_env} is empty or unavailable.`,
      )
    }
    if (input.agent_env && !agent) {
      throw new Error(
        `Environment variable ${input.agent_env} is empty or unavailable.`,
      )
    }

    let privateKey = input.private_key
    if (input.private_key_path) {
      privateKey = await fs.readFile(
        localPath(context.projectRoot, input.private_key_path),
        'utf8',
      )
    }

    if (!password && !privateKey && !agent) {
      throw new Error(
        'No SSH authentication is available. Use prompt_password, password/password_env, private_key/private_key_path, or agent/agent_env.',
      )
    }

    const client = this.options.clientFactory?.() ?? new Client()
    let connectionState: ConnectionState | undefined
    client.on('error', (error: Error) => {
      if (connectionState) connectionState.lastError = error.message
    })

    const config: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: input.ready_timeout_ms ?? 30_000,
      keepaliveInterval: input.keepalive_interval_ms ?? 15_000,
      keepaliveCountMax: 4,
      ...(password ? { password } : {}),
      ...(privateKey
        ? { privateKey, ...(passphrase ? { passphrase } : {}) }
        : {}),
      ...(agent ? { agent } : {}),
    }

    if (input.host_fingerprint_sha256) {
      const expected = input.host_fingerprint_sha256
        .replace(/^SHA256:/i, '')
        .replace(/=+$/, '')
        .trim()
      config.hostHash = 'sha256'
      config.hostVerifier = (actual: string) => {
        const normalizedActual = actual
          .replace(/^SHA256:/i, '')
          .replace(/=+$/, '')
          .trim()
        const actualBase64 = /^[a-f0-9]{64}$/i.test(normalizedActual)
          ? Buffer.from(normalizedActual, 'hex')
              .toString('base64')
              .replace(/=+$/, '')
          : normalizedActual
        return (
          normalizedActual.toLowerCase() === expected.toLowerCase() ||
          actualBase64 === expected
        )
      }
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort)
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
      }
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onAbort = () => {
        cleanup()
        client.end()
        reject(new Error('SSH connection cancelled by the user.'))
      }
      client.once('ready', onReady)
      client.once('error', onError)
      signal?.addEventListener('abort', onAbort, { once: true })
      client.connect(config)
    })

    this.sequence += 1
    const id = `ssh-${this.sequence}-${randomUUID().slice(0, 8)}`
    const connectedAt = now()
    const connection: ConnectionState = {
      id,
      name: input.name?.trim() || input.label?.trim() || host,
      ...(linkedServerId ? { serverId: linkedServerId } : {}),
      host,
      port,
      username,
      client,
      cwd: '.',
      connectedAt,
      lastUsedAt: connectedAt,
      closed: false,
      operationQueue: Promise.resolve(),
    }
    connectionState = connection

    const markClosed = () => {
      connection.closed = true
      connection.shell && (connection.shell.closed = true)
      this.connections.delete(id)
    }
    client.once('close', markClosed)
    client.once('end', markClosed)
    this.connections.set(id, connection)

    try {
      const initialPwd = await this.execCommand(connection, 'pwd', {
        timeoutSeconds: 10,
        maxBytes: 16_384,
        rawCommand: true,
        signal,
      })
      if (initialPwd.exitCode === 0 && initialPwd.stdout.trim()) {
        connection.cwd = initialPwd.stdout.trim().split(/\r?\n/).at(-1) ?? '.'
      }
    } catch {
      // The connection is still usable even when the remote login shell cannot
      // resolve its initial directory. Later `cd` calls can establish it.
    }

    if (signal?.aborted) {
      this.close(connection)
      throw new Error('SSH connection cancelled by the user.')
    }

    let savedServer: SshServerProfile | undefined
    let serverCreated = false
    let serverSaveError: string | undefined
    let credentialSaveError: string | undefined
    if (!linkedServerId && input.save_server !== false) {
      try {
        const saved = await this.serverStore.upsertByEndpoint(
          this.profileInputFromTool(input, context),
        )
        savedServer = saved.profile
        serverCreated = saved.created
        connection.serverId = saved.profile.id
        connection.name = getSshServerDisplayName(saved.profile)
      } catch (error) {
        serverSaveError = error instanceof Error ? error.message : String(error)
      }

      if (savedServer && (promptedPassword || promptedPassphrase)) {
        try {
          await this.credentialVault.setServerSecrets(
            savedServer.id,
            {
              ...(promptedPassword ? { password: promptedPassword } : {}),
              ...(promptedPassphrase ? { passphrase: promptedPassphrase } : {}),
            },
            this.vaultContext(savedServer, signal, context),
          )
          savedServer = await this.serverStore.update(savedServer.id, {
            ...(promptedPassword ? { password_vault: true } : {}),
            ...(promptedPassphrase ? { passphrase_vault: true } : {}),
          })
          connection.name = getSshServerDisplayName(savedServer)
        } catch (error) {
          credentialSaveError = error instanceof Error ? error.message : String(error)
        }
      }
    }

    return {
      ok: true,
      action: 'connect',
      ...compactConnection(connection),
      server_saved: Boolean(linkedServerId || savedServer),
      ...(savedServer
        ? {
            server_created: serverCreated,
            server: compactSshServerProfile(savedServer),
          }
        : {}),
      ...(serverSaveError ? { server_save_error: serverSaveError } : {}),
      ...(credentialSaveError
        ? { credential_save_error: credentialSaveError }
        : {}),
      message: serverSaveError
        ? 'Persistent SSH connection opened, but its server profile could not be saved. The connection remains usable.'
        : credentialSaveError
          ? 'Persistent SSH connection opened and the server profile was saved, but its prompted credential could not be encrypted.'
          : linkedServerId || savedServer
            ? 'Persistent SSH connection opened and linked to the global server registry.'
            : 'Persistent SSH connection opened without saving a server profile.',
    }
  }

  private async executeForConnection(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal: AbortSignal | undefined,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    switch (input.action) {
      case 'status':
        return compactConnection(connection)
      case 'pwd':
        return { ...compactConnection(connection), path: connection.cwd }
      case 'cd':
        return this.changeDirectory(connection, input.path!, signal)
      case 'list':
        return this.list(connection, input.path ?? '.', signal)
      case 'stat':
        return this.stat(connection, input.path!, signal)
      case 'read_file':
        return this.readFile(connection, input, signal)
      case 'exec':
        return this.exec(connection, input, signal)
      case 'shell_open':
        return this.openShell(connection, input, signal)
      case 'shell_write':
        return this.writeShell(connection, input, signal)
      case 'shell_read':
        return this.readShell(connection, input, signal)
      case 'upload':
        return this.upload(connection, input, context)
      case 'download':
        return this.download(connection, input, context)
      case 'write_file':
        return this.writeFile(connection, input)
      case 'mkdir':
        return this.mkdir(connection, input.path!, input.recursive ?? false)
      case 'rename':
        return this.rename(connection, input.path!, input.destination_path!)
      case 'delete':
        return this.delete(connection, input.path!, input.recursive ?? false)
      case 'close':
        return this.close(connection)
      default:
        throw new Error(`Unsupported SSH action: ${input.action}`)
    }
  }

  private async getSftp(connection: ConnectionState): Promise<SFTPWrapper> {
    if (connection.sftp) return connection.sftp
    connection.sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      connection.client.sftp((error, sftp) => {
        if (error) reject(error)
        else resolve(sftp)
      })
    })
    return connection.sftp
  }

  private async changeDirectory(
    connection: ConnectionState,
    requestedPath: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const target = resolveRemotePath(connection.cwd, requestedPath)
    const result = await this.execCommand(
      connection,
      `cd ${shellQuote(target)} && pwd`,
      {
        timeoutSeconds: 15,
        maxBytes: 32_768,
        rawCommand: true,
        signal,
      },
    )
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || `Unable to change directory to ${target}`,
      )
    }
    connection.cwd = result.stdout.trim().split(/\r?\n/).at(-1) || target
    return {
      ok: true,
      action: 'cd',
      connection_id: connection.id,
      path: connection.cwd,
    }
  }

  private async list(
    connection: ConnectionState,
    requestedPath: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('SSH list cancelled.')
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, requestedPath)
    const entries = await sftpCall<FileEntry[]>((callback) =>
      sftp.readdir(target, callback),
    )
    return {
      action: 'list',
      connection_id: connection.id,
      path: target,
      entries: entries.map((entry) => ({
        name: entry.filename,
        longname: entry.longname,
        size: entry.attrs.size,
        mode: entry.attrs.mode,
        modified_at: new Date(entry.attrs.mtime * 1_000).toISOString(),
        type: entryType(entry.attrs.mode),
      })),
    }
  }

  private async stat(
    connection: ConnectionState,
    requestedPath: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('SSH stat cancelled.')
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, requestedPath)
    const attrs = await sftpCall<Stats>((callback) =>
      sftp.lstat(target, callback),
    )
    return {
      action: 'stat',
      connection_id: connection.id,
      path: target,
      size: attrs.size,
      mode: attrs.mode,
      uid: attrs.uid,
      gid: attrs.gid,
      accessed_at: new Date(attrs.atime * 1_000).toISOString(),
      modified_at: new Date(attrs.mtime * 1_000).toISOString(),
      type: attrs.isDirectory()
        ? 'directory'
        : attrs.isSymbolicLink()
          ? 'symlink'
          : 'file',
    }
  }

  private async readFile(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('SSH file read cancelled.')
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, input.path!)
    const attrs = await sftpCall<Stats>((callback) =>
      sftp.stat(target, callback),
    )
    const maxBytes = input.max_bytes ?? DEFAULT_MAX_BYTES
    const bytesToRead = Math.min(attrs.size, maxBytes)
    const content =
      bytesToRead === 0
        ? Buffer.alloc(0)
        : await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = []
            const stream = sftp.createReadStream(target, {
              start: 0,
              end: bytesToRead - 1,
              autoClose: true,
            })
            const onAbort = () => {
              stream.destroy(new Error('SSH file read cancelled by the user.'))
            }
            signal?.addEventListener('abort', onAbort, { once: true })
            stream.on('data', (chunk: Buffer | string) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            })
            stream.once('error', (error: Error) => {
              signal?.removeEventListener('abort', onAbort)
              reject(error)
            })
            stream.once('end', () => {
              signal?.removeEventListener('abort', onAbort)
              resolve(Buffer.concat(chunks))
            })
          })
    return {
      action: 'read_file',
      connection_id: connection.id,
      path: target,
      size: attrs.size,
      truncated: attrs.size > maxBytes,
      encoding: input.encoding ?? 'utf8',
      content:
        input.encoding === 'base64'
          ? content.toString('base64')
          : content.toString('utf8'),
    }
  }

  private async exec(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const result = await this.execCommand(connection, input.command!, {
      timeoutSeconds: input.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
      maxBytes: input.max_bytes ?? DEFAULT_MAX_BYTES,
      pty: input.pty,
      signal,
    })
    return {
      action: 'exec',
      connection_id: connection.id,
      cwd: connection.cwd,
      command: input.command,
      ...result,
    }
  }

  private async execCommand(
    connection: ConnectionState,
    command: string,
    options: {
      timeoutSeconds: number
      maxBytes: number
      rawCommand?: boolean
      pty?: boolean
      signal?: AbortSignal
    },
  ): Promise<{
    stdout: string
    stderr: string
    stdout_truncated: boolean
    stderr_truncated: boolean
    exitCode: number | null
    signal: string | null
  }> {
    const finalCommand = options.rawCommand
      ? command
      : `cd ${shellQuote(connection.cwd)} && ${command}`

    return await new Promise((resolve, reject) => {
      let channel: ClientChannel | undefined
      let stdout = ''
      let stderr = ''
      let settled = false
      let exitCode: number | null = null
      let exitSignal: string | null = null
      const timeout =
        options.timeoutSeconds < 0
          ? undefined
          : setTimeout(() => {
              channel?.close()
              finish(
                new Error(
                  `SSH command timed out after ${options.timeoutSeconds}s.`,
                ),
              )
            }, options.timeoutSeconds * 1_000)

      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) {
          reject(error)
          return
        }
        const out = trimOutput(stdout, options.maxBytes)
        const err = trimOutput(stderr, options.maxBytes)
        resolve({
          stdout: out.value,
          stderr: err.value,
          stdout_truncated: out.truncated,
          stderr_truncated: err.truncated,
          exitCode,
          signal: exitSignal,
        })
      }
      const onAbort = () => {
        channel?.close()
        finish(new Error('SSH command cancelled by the user.'))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      connection.client.exec(
        finalCommand,
        options.pty ? { pty: true } : {},
        (error, stream) => {
          if (error) {
            finish(error)
            return
          }
          channel = stream
          stream.setEncoding('utf8')
          stream.stderr.setEncoding('utf8')
          stream.on('data', (chunk: string | Buffer) => {
            if (stdout.length < MAX_SHELL_BUFFER) stdout += chunk.toString()
          })
          stream.stderr.on('data', (chunk: string | Buffer) => {
            if (stderr.length < MAX_SHELL_BUFFER) stderr += chunk.toString()
          })
          stream.on(
            'exit',
            (code: number | undefined, signalName: string | undefined) => {
              exitCode = typeof code === 'number' ? code : null
              exitSignal = signalName ?? null
            },
          )
          stream.once('error', finish)
          stream.once('close', () => finish())
        },
      )
    })
  }

  private async openShell(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (connection.shell && !connection.shell.closed) {
      return {
        ok: true,
        action: 'shell_open',
        connection_id: connection.id,
        already_open: true,
      }
    }
    if (signal?.aborted) throw new Error('SSH shell opening cancelled.')

    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      connection.client.shell(
        {
          term: 'xterm-256color',
          cols: input.cols ?? 120,
          rows: input.rows ?? 30,
        },
        (error, stream) => {
          if (error) reject(error)
          else resolve(stream)
        },
      )
    })
    const shell: ShellState = { channel, stdout: '', stderr: '', closed: false }
    connection.shell = shell
    channel.setEncoding('utf8')
    channel.stderr.setEncoding('utf8')
    channel.on('data', (chunk: string | Buffer) => {
      shell.stdout = (shell.stdout + chunk.toString()).slice(-MAX_SHELL_BUFFER)
    })
    channel.stderr.on('data', (chunk: string | Buffer) => {
      shell.stderr = (shell.stderr + chunk.toString()).slice(-MAX_SHELL_BUFFER)
    })
    channel.once('close', () => {
      shell.closed = true
    })
    channel.once('error', (error: Error) => {
      shell.stderr = `${shell.stderr}\n${error.message}`.slice(
        -MAX_SHELL_BUFFER,
      )
      shell.closed = true
    })
    channel.write(`cd ${shellQuote(connection.cwd)}\n`)
    await wait(input.wait_ms ?? 350)
    return this.consumeShell(
      connection,
      input.max_bytes ?? DEFAULT_MAX_BYTES,
      'shell_open',
    )
  }

  private async writeShell(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('SSH shell write cancelled.')
    const shell = connection.shell
    if (!shell || shell.closed) {
      throw new Error('No persistent shell is open. Call shell_open first.')
    }
    shell.channel.write(`${input.command!}\n`)
    await wait(input.wait_ms ?? 350)
    return {
      ...this.consumeShell(
        connection,
        input.max_bytes ?? DEFAULT_MAX_BYTES,
        'shell_write',
      ),
      command: input.command,
    }
  }

  private async readShell(
    connection: ConnectionState,
    input: SshRemoteInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('SSH shell read cancelled.')
    const shell = connection.shell
    if (!shell) throw new Error('No persistent shell has been opened.')
    await wait(input.wait_ms ?? 350)
    return this.consumeShell(
      connection,
      input.max_bytes ?? DEFAULT_MAX_BYTES,
      'shell_read',
    )
  }

  private consumeShell(
    connection: ConnectionState,
    maxBytes: number,
    action: 'shell_open' | 'shell_write' | 'shell_read',
  ): Record<string, unknown> {
    const shell = connection.shell!
    const stdout = trimOutput(shell.stdout, maxBytes)
    const stderr = trimOutput(shell.stderr, maxBytes)
    shell.stdout = ''
    shell.stderr = ''
    return {
      action,
      connection_id: connection.id,
      cwd: connection.cwd,
      shell_open: !shell.closed,
      stdout: stdout.value,
      stderr: stderr.value,
      stdout_truncated: stdout.truncated,
      stderr_truncated: stderr.truncated,
    }
  }

  private async upload(
    connection: ConnectionState,
    input: SshRemoteInput,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const source = localPath(context.projectRoot, input.local_path!)
    const target = resolveRemotePath(connection.cwd, input.remote_path!)
    if (!input.overwrite && (await this.remoteExists(sftp, target))) {
      throw new Error(
        `Remote destination already exists: ${target}. Set overwrite=true to replace it.`,
      )
    }
    await sftpVoid((callback) => sftp.fastPut(source, target, callback))
    const stats = await fs.stat(source)
    return {
      ok: true,
      action: 'upload',
      connection_id: connection.id,
      local_path: source,
      remote_path: target,
      bytes: stats.size,
    }
  }

  private async download(
    connection: ConnectionState,
    input: SshRemoteInput,
    context: SshRemoteExecutionContext,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const source = resolveRemotePath(connection.cwd, input.remote_path!)
    const target = localPath(context.projectRoot, input.local_path!)
    if (!input.overwrite) {
      try {
        await fs.access(target)
        throw new Error(
          `Local destination already exists: ${target}. Set overwrite=true to replace it.`,
        )
      } catch (error) {
        if (
          error instanceof Error &&
          !('code' in error && error.code === 'ENOENT')
        ) {
          throw error
        }
      }
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await sftpVoid((callback) => sftp.fastGet(source, target, callback))
    const stats = await fs.stat(target)
    return {
      ok: true,
      action: 'download',
      connection_id: connection.id,
      remote_path: source,
      local_path: target,
      bytes: stats.size,
    }
  }

  private async writeFile(
    connection: ConnectionState,
    input: SshRemoteInput,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, input.path!)
    if (!input.overwrite && (await this.remoteExists(sftp, target))) {
      throw new Error(
        `Remote file already exists: ${target}. Set overwrite=true to replace it.`,
      )
    }
    const content = Buffer.from(
      input.content!,
      input.encoding === 'base64' ? 'base64' : 'utf8',
    )
    await sftpVoid((callback) => sftp.writeFile(target, content, callback))
    return {
      ok: true,
      action: 'write_file',
      connection_id: connection.id,
      path: target,
      bytes: content.length,
    }
  }

  private async mkdir(
    connection: ConnectionState,
    requestedPath: string,
    recursive: boolean,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, requestedPath)
    if (recursive) {
      const parts = target.split('/').filter(Boolean)
      let current = target.startsWith('/') ? '/' : '.'
      for (const part of parts) {
        current = current === '/' ? `/${part}` : posixPath.join(current, part)
        if (!(await this.remoteExists(sftp, current))) {
          await sftpVoid((callback) => sftp.mkdir(current, callback))
        }
      }
    } else {
      await sftpVoid((callback) => sftp.mkdir(target, callback))
    }
    return {
      ok: true,
      action: 'mkdir',
      connection_id: connection.id,
      path: target,
    }
  }

  private async rename(
    connection: ConnectionState,
    sourcePath: string,
    destinationPath: string,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const source = resolveRemotePath(connection.cwd, sourcePath)
    const destination = resolveRemotePath(connection.cwd, destinationPath)
    await sftpVoid((callback) => sftp.rename(source, destination, callback))
    return {
      ok: true,
      action: 'rename',
      connection_id: connection.id,
      path: source,
      destination_path: destination,
    }
  }

  private async delete(
    connection: ConnectionState,
    requestedPath: string,
    recursive: boolean,
  ): Promise<Record<string, unknown>> {
    const sftp = await this.getSftp(connection)
    const target = resolveRemotePath(connection.cwd, requestedPath)
    const attrs = await sftpCall<Stats>((callback) =>
      sftp.lstat(target, callback),
    )
    if (attrs.isDirectory()) {
      if (recursive) await this.deleteDirectoryRecursive(sftp, target)
      else await sftpVoid((callback) => sftp.rmdir(target, callback))
    } else {
      await sftpVoid((callback) => sftp.unlink(target, callback))
    }
    return {
      ok: true,
      action: 'delete',
      connection_id: connection.id,
      path: target,
      recursive,
    }
  }

  private async deleteDirectoryRecursive(
    sftp: SFTPWrapper,
    target: string,
  ): Promise<void> {
    const entries = await sftpCall<FileEntry[]>((callback) =>
      sftp.readdir(target, callback),
    )
    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue
      const child = posixPath.join(target, entry.filename)
      if (entryType(entry.attrs.mode) === 'directory') {
        await this.deleteDirectoryRecursive(sftp, child)
      } else {
        await sftpVoid((callback) => sftp.unlink(child, callback))
      }
    }
    await sftpVoid((callback) => sftp.rmdir(target, callback))
  }

  private async remoteExists(
    sftp: SFTPWrapper,
    target: string,
  ): Promise<boolean> {
    try {
      await sftpCall<Stats>((callback) => sftp.lstat(target, callback))
      return true
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 2
      ) {
        return false
      }
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (message.includes('no such file')) return false
      throw error
    }
  }

  private close(connection: ConnectionState): Record<string, unknown> {
    connection.shell?.channel.end()
    connection.sftp?.end()
    connection.closed = true
    connection.client.end()
    this.connections.delete(connection.id)
    return {
      ok: true,
      action: 'close',
      connection_id: connection.id,
      message: 'SSH connection closed.',
    }
  }

  private closeAll(): Record<string, unknown> {
    const ids = [...this.connections.keys()]
    for (const connection of this.connections.values()) {
      connection.shell?.channel.end()
      connection.sftp?.end()
      connection.closed = true
      connection.client.end()
    }
    this.connections.clear()
    return {
      ok: true,
      action: 'close_all',
      closed_connection_ids: ids,
      count: ids.length,
    }
  }
}

let persistentManager: PersistentSshManager | undefined

export function getPersistentSshManager(): PersistentSshManager {
  persistentManager ??= new PersistentSshManager()
  return persistentManager
}
