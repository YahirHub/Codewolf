import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt,
} from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getCodewolfHomeDir } from '@codebuff/common/util/codewolf-home'

import type { RequestSecretFn } from '@codebuff/common/types/secret-prompt'

export const SSH_SECRETS_FILE_NAME = 'ssh-secrets.enc'
const ENVELOPE_VERSION = 1 as const
const PAYLOAD_VERSION = 1 as const
const AAD = Buffer.from('codewolf:ssh-secrets:v1', 'utf8')
const KEY_LENGTH = 32
const SCRYPT_N = 32_768
const SCRYPT_R = 8
const SCRYPT_P = 1
const MAX_UNLOCK_ATTEMPTS = 3

type VaultEnvelope = {
  version: typeof ENVELOPE_VERSION
  kdf: {
    name: 'scrypt'
    salt: string
    N: number
    r: number
    p: number
    key_length: number
  }
  cipher: {
    name: 'aes-256-gcm'
    iv: string
    auth_tag: string
  }
  ciphertext: string
}

export type SshStoredSecrets = {
  password?: string
  passphrase?: string
  updated_at: string
}

type VaultPayload = {
  version: typeof PAYLOAD_VERSION
  created_at: string
  updated_at: string
  secrets: Record<string, SshStoredSecrets>
}

export type SshCredentialVaultContext = {
  requestSecret?: RequestSecretFn
  signal?: AbortSignal
  serverName?: string
}

export type SshCredentialVaultStatus = {
  path: string
  exists: boolean
  unlocked: boolean
  secret_server_count?: number
}

function now(): string {
  return new Date().toISOString()
}

function decodeBase64(value: unknown, field: string): Buffer {
  if (typeof value !== 'string' || !value) {
    throw new Error(`La bóveda SSH no contiene ${field} válido.`)
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length === 0) {
    throw new Error(`La bóveda SSH no contiene ${field} válido.`)
  }
  return decoded
}

function validateEnvelope(value: unknown): VaultEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El archivo de la bóveda SSH no es válido.')
  }
  const record = value as Record<string, unknown>
  if (record.version !== ENVELOPE_VERSION) {
    throw new Error(
      `Versión de bóveda SSH no compatible: ${String(record.version)}`,
    )
  }
  const kdf = record.kdf as Record<string, unknown> | undefined
  const cipher = record.cipher as Record<string, unknown> | undefined
  if (!kdf || kdf.name !== 'scrypt') {
    throw new Error('La bóveda SSH usa un KDF no compatible.')
  }
  if (!cipher || cipher.name !== 'aes-256-gcm') {
    throw new Error('La bóveda SSH usa un cifrado no compatible.')
  }

  const N = Number(kdf.N)
  const r = Number(kdf.r)
  const p = Number(kdf.p)
  const keyLength = Number(kdf.key_length)
  const validPowerOfTwo = Number.isInteger(N) && N > 0 && (N & (N - 1)) === 0
  if (
    !validPowerOfTwo ||
    N < 16_384 ||
    N > 262_144 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 32 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 8 ||
    keyLength !== KEY_LENGTH
  ) {
    throw new Error('Los parámetros criptográficos de la bóveda SSH no son válidos.')
  }

  decodeBase64(kdf.salt, 'salt')
  const iv = decodeBase64(cipher.iv, 'iv')
  const authTag = decodeBase64(cipher.auth_tag, 'auth_tag')
  decodeBase64(record.ciphertext, 'ciphertext')
  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('La bóveda SSH contiene parámetros AES-GCM inválidos.')
  }

  return {
    version: ENVELOPE_VERSION,
    kdf: {
      name: 'scrypt',
      salt: String(kdf.salt),
      N,
      r,
      p,
      key_length: KEY_LENGTH,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: String(cipher.iv),
      auth_tag: String(cipher.auth_tag),
    },
    ciphertext: String(record.ciphertext),
  }
}

function validatePayload(value: unknown): VaultPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El contenido descifrado de la bóveda SSH no es válido.')
  }
  const record = value as Record<string, unknown>
  if (record.version !== PAYLOAD_VERSION) {
    throw new Error(
      `Versión interna de bóveda SSH no compatible: ${String(record.version)}`,
    )
  }
  if (!record.secrets || typeof record.secrets !== 'object' || Array.isArray(record.secrets)) {
    throw new Error('La bóveda SSH no contiene un registro de secretos válido.')
  }

  const secrets: Record<string, SshStoredSecrets> = {}
  for (const [serverId, rawSecret] of Object.entries(
    record.secrets as Record<string, unknown>,
  )) {
    if (!rawSecret || typeof rawSecret !== 'object' || Array.isArray(rawSecret)) {
      throw new Error(`La entrada cifrada de ${serverId} no es válida.`)
    }
    const secret = rawSecret as Record<string, unknown>
    const password =
      typeof secret.password === 'string' ? secret.password : undefined
    const passphrase =
      typeof secret.passphrase === 'string' ? secret.passphrase : undefined
    if (!password && !passphrase) continue
    secrets[serverId] = {
      ...(password ? { password } : {}),
      ...(passphrase ? { passphrase } : {}),
      updated_at:
        typeof secret.updated_at === 'string' ? secret.updated_at : now(),
    }
  }

  return {
    version: PAYLOAD_VERSION,
    created_at:
      typeof record.created_at === 'string' ? record.created_at : now(),
    updated_at:
      typeof record.updated_at === 'string' ? record.updated_at : now(),
    secrets,
  }
}

async function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 256 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error)
        else resolve(Buffer.from(derivedKey))
      },
    )
  })
}

function decryptPayload(envelope: VaultEnvelope, key: Buffer): VaultPayload {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.cipher.iv, 'base64'),
  )
  decipher.setAAD(AAD)
  decipher.setAuthTag(Buffer.from(envelope.cipher.auth_tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ])
  try {
    return validatePayload(JSON.parse(plaintext.toString('utf8')))
  } finally {
    plaintext.fill(0)
  }
}

function encryptPayload(
  payload: VaultPayload,
  key: Buffer,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): VaultEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(AAD)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return {
      version: ENVELOPE_VERSION,
      kdf: {
        name: 'scrypt',
        salt: salt.toString('base64'),
        N: params.N,
        r: params.r,
        p: params.p,
        key_length: KEY_LENGTH,
      },
      cipher: {
        name: 'aes-256-gcm',
        iv: iv.toString('base64'),
        auth_tag: cipher.getAuthTag().toString('base64'),
      },
      ciphertext: ciphertext.toString('base64'),
    }
  } finally {
    plaintext.fill(0)
  }
}

export function getSshSecretsPath(configDir = getCodewolfHomeDir()): string {
  return path.join(configDir, SSH_SECRETS_FILE_NAME)
}

export class SshCredentialVault {
  private payload?: VaultPayload
  private key?: Buffer
  private salt?: Buffer
  private kdfParams?: { N: number; r: number; p: number }
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly configDir = getCodewolfHomeDir()) {}

  get filePath(): string {
    return getSshSecretsPath(this.configDir)
  }

  async status(): Promise<SshCredentialVaultStatus> {
    const exists = await fs
      .stat(this.filePath)
      .then(() => true)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false
        throw error
      })
    return {
      path: this.filePath,
      exists,
      unlocked: Boolean(this.payload && this.key),
      ...(this.payload
        ? { secret_server_count: Object.keys(this.payload.secrets).length }
        : {}),
    }
  }

  async unlock(context: SshCredentialVaultContext): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureUnlocked(context, true)
    })
  }

  async lock(): Promise<void> {
    await this.enqueue(async () => {
      this.clearUnlockedState()
    })
  }

  async getServerSecrets(
    serverId: string,
    context: SshCredentialVaultContext,
  ): Promise<SshStoredSecrets | undefined> {
    return await this.enqueue(async () => {
      await this.ensureUnlocked(context, false)
      const value = this.payload!.secrets[serverId]
      return value ? { ...value } : undefined
    })
  }

  async setServerSecrets(
    serverId: string,
    patch: { password?: string; passphrase?: string },
    context: SshCredentialVaultContext,
  ): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureUnlocked(context, true)
      const current = this.payload!.secrets[serverId]
      const next: SshStoredSecrets = {
        ...(current?.password ? { password: current.password } : {}),
        ...(current?.passphrase ? { passphrase: current.passphrase } : {}),
        ...(patch.password !== undefined
          ? patch.password
            ? { password: patch.password }
            : {}
          : {}),
        ...(patch.passphrase !== undefined
          ? patch.passphrase
            ? { passphrase: patch.passphrase }
            : {}
          : {}),
        updated_at: now(),
      }
      if (patch.password === '') delete next.password
      if (patch.passphrase === '') delete next.passphrase
      if (!next.password && !next.passphrase) delete this.payload!.secrets[serverId]
      else this.payload!.secrets[serverId] = next
      this.payload!.updated_at = now()
      await this.writeUnlocked()
    })
  }

  async clearServerSecret(
    serverId: string,
    field: 'password' | 'passphrase',
    context: SshCredentialVaultContext,
  ): Promise<boolean> {
    return await this.enqueue(async () => {
      const status = await this.status()
      if (!status.exists && !this.payload) return false
      await this.ensureUnlocked(context, false)
      const current = this.payload!.secrets[serverId]
      if (!current?.[field]) return false
      const next = { ...current }
      delete next[field]
      next.updated_at = now()
      if (!next.password && !next.passphrase) delete this.payload!.secrets[serverId]
      else this.payload!.secrets[serverId] = next
      this.payload!.updated_at = now()
      await this.writeUnlocked()
      return true
    })
  }

  async deleteServerSecrets(
    serverId: string,
    context: SshCredentialVaultContext,
  ): Promise<boolean> {
    return await this.enqueue(async () => {
      const status = await this.status()
      if (!status.exists && !this.payload) return false
      await this.ensureUnlocked(context, false)
      if (!this.payload!.secrets[serverId]) return false
      delete this.payload!.secrets[serverId]
      this.payload!.updated_at = now()
      await this.writeUnlocked()
      return true
    })
  }

  async changeMasterPassword(
    context: SshCredentialVaultContext,
  ): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureUnlocked(context, false)
      const password = await this.requestPassword(context, {
        kind: 'vault-master-password-change',
        title: 'Cambiar contraseña maestra SSH',
        message:
          'Crea la nueva contraseña maestra. Se volverá a cifrar la bóveda completa y no se almacenará esta contraseña.',
        confirm: true,
        minLength: 8,
      })
      const newSalt = randomBytes(16)
      const newKey = await deriveKey(password, newSalt, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
      })
      const oldKey = this.key
      const oldSalt = this.salt
      const oldKdfParams = this.kdfParams
      this.key = newKey
      this.salt = newSalt
      this.kdfParams = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
      try {
        await this.writeUnlocked()
        oldKey?.fill(0)
      } catch (error) {
        newKey.fill(0)
        this.key = oldKey
        this.salt = oldSalt
        this.kdfParams = oldKdfParams
        throw error
      }
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

  private async ensureUnlocked(
    context: SshCredentialVaultContext,
    createIfMissing: boolean,
  ): Promise<void> {
    if (this.payload && this.key && this.salt && this.kdfParams) return
    if (context.signal?.aborted) throw new Error('Operación de bóveda SSH cancelada.')

    let envelope: VaultEnvelope | undefined
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      envelope = validateEnvelope(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof SyntaxError) {
          throw new Error(`La bóveda SSH está dañada: ${this.filePath}`)
        }
        throw error
      }
    }

    if (!envelope) {
      if (!createIfMissing) {
        throw new Error(
          'La bóveda SSH todavía no existe. Guarda una contraseña SSH primero para crearla.',
        )
      }
      const password = await this.requestPassword(context, {
        kind: 'vault-master-password-create',
        title: 'Crear contraseña maestra SSH',
        message:
          'Esta contraseña cifra todas las credenciales SSH portables de .codewolf. Deberás introducirla cada vez que abras Codewolf.',
        confirm: true,
        minLength: 8,
      })
      const salt = randomBytes(16)
      const key = await deriveKey(password, salt, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
      })
      const timestamp = now()
      this.key = key
      this.salt = salt
      this.kdfParams = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
      this.payload = {
        version: PAYLOAD_VERSION,
        created_at: timestamp,
        updated_at: timestamp,
        secrets: {},
      }
      try {
        await this.writeUnlocked()
      } catch (error) {
        this.clearUnlockedState()
        throw error
      }
      return
    }

    const salt = Buffer.from(envelope.kdf.salt, 'base64')
    const params = {
      N: envelope.kdf.N,
      r: envelope.kdf.r,
      p: envelope.kdf.p,
    }
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_UNLOCK_ATTEMPTS; attempt += 1) {
      const password = await this.requestPassword(context, {
        kind: 'vault-master-password',
        title: 'Desbloquear bóveda SSH',
        message:
          attempt === 1
            ? 'Introduce la contraseña maestra para usar las credenciales SSH cifradas durante esta ejecución de Codewolf.'
            : 'La contraseña anterior no pudo desbloquear la bóveda. Inténtalo de nuevo.',
        minLength: 1,
        attempt,
        maxAttempts: MAX_UNLOCK_ATTEMPTS,
      })
      const key = await deriveKey(password, salt, params)
      try {
        const payload = decryptPayload(envelope, key)
        this.key = key
        this.salt = salt
        this.kdfParams = params
        this.payload = payload
        return
      } catch (error) {
        key.fill(0)
        lastError = error
      }
    }
    throw new Error(
      `No se pudo desbloquear la bóveda SSH después de ${MAX_UNLOCK_ATTEMPTS} intentos.${
        lastError ? ' La contraseña es incorrecta o el archivo fue modificado.' : ''
      }`,
    )
  }

  private async requestPassword(
    context: SshCredentialVaultContext,
    request: {
      kind:
        | 'vault-master-password'
        | 'vault-master-password-create'
        | 'vault-master-password-change'
      title: string
      message: string
      confirm?: boolean
      minLength: number
      attempt?: number
      maxAttempts?: number
    },
  ): Promise<string> {
    if (!context.requestSecret) {
      throw new Error(
        'Codewolf necesita un controlador local de entrada secreta para desbloquear la bóveda SSH.',
      )
    }
    const response = await context.requestSecret(
      {
        requestId: randomUUID(),
        ...request,
        ...(context.serverName ? { serverName: context.serverName } : {}),
      },
      context.signal,
    )
    if (response.cancelled || response.value === undefined) {
      throw new Error('El usuario canceló la entrada de la contraseña SSH.')
    }
    if (response.value.length < request.minLength) {
      throw new Error(
        `La contraseña debe tener al menos ${request.minLength} caracteres.`,
      )
    }
    return response.value
  }


  private clearUnlockedState(): void {
    this.key?.fill(0)
    this.key = undefined
    this.payload = undefined
    this.salt = undefined
    this.kdfParams = undefined
  }

  private async writeUnlocked(): Promise<void> {
    if (!this.payload || !this.key || !this.salt || !this.kdfParams) {
      throw new Error('La bóveda SSH no está desbloqueada.')
    }
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 })
    const envelope = encryptPayload(
      this.payload,
      this.key,
      this.salt,
      this.kdfParams,
    )
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(envelope, null, 2)}\n`, {
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
}
