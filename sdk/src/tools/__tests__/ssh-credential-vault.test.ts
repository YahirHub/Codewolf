import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  SshCredentialVault,
  getSshSecretsPath,
} from '../ssh-credential-vault'

import type { RequestSecretFn } from '@codebuff/common/types/secret-prompt'

const tempDirs: string[] = []

function createTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-vault-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('SSH encrypted credential vault', () => {
  test('encrypts credentials and never writes plaintext secrets', async () => {
    const configDir = createTempDir()
    const vault = new SshCredentialVault(configDir)
    const requestSecret: RequestSecretFn = async (request) => ({
      value:
        request.kind === 'vault-master-password-create'
          ? 'portable-master-password'
          : 'portable-master-password',
    })

    await vault.setServerSecrets(
      'server-production',
      {
        password: 'ssh-password-value',
        passphrase: 'private-key-passphrase',
      },
      { requestSecret, serverName: 'Producción' },
    )

    const encrypted = fs.readFileSync(getSshSecretsPath(configDir), 'utf8')
    expect(encrypted).toContain('aes-256-gcm')
    expect(encrypted).toContain('scrypt')
    expect(encrypted).not.toContain('portable-master-password')
    expect(encrypted).not.toContain('ssh-password-value')
    expect(encrypted).not.toContain('private-key-passphrase')

    expect(
      await vault.getServerSecrets('server-production', { requestSecret }),
    ).toMatchObject({
      password: 'ssh-password-value',
      passphrase: 'private-key-passphrase',
    })
  })

  test('locks per process and retries an incorrect master password', async () => {
    const configDir = createTempDir()
    const vault = new SshCredentialVault(configDir)
    await vault.setServerSecrets(
      'server-a',
      { password: 'server-secret' },
      {
        requestSecret: async () => ({ value: 'correct-master-password' }),
      },
    )
    await vault.lock()

    let attempt = 0
    const secrets = await vault.getServerSecrets('server-a', {
      requestSecret: async (request) => {
        expect(request.kind).toBe('vault-master-password')
        attempt += 1
        return {
          value:
            attempt === 1 ? 'incorrect-master-password' : 'correct-master-password',
        }
      },
    })

    expect(attempt).toBe(2)
    expect(secrets?.password).toBe('server-secret')
    expect((await vault.status()).unlocked).toBe(true)
  })

  test('changes the master password without changing server credentials', async () => {
    const configDir = createTempDir()
    const vault = new SshCredentialVault(configDir)
    await vault.setServerSecrets(
      'server-a',
      { password: 'server-secret' },
      {
        requestSecret: async () => ({ value: 'old-master-password' }),
      },
    )

    await vault.changeMasterPassword({
      requestSecret: async (request) => ({
        value:
          request.kind === 'vault-master-password-change'
            ? 'new-master-password'
            : 'old-master-password',
      }),
    })
    await vault.lock()

    const secrets = await vault.getServerSecrets('server-a', {
      requestSecret: async () => ({ value: 'new-master-password' }),
    })
    expect(secrets?.password).toBe('server-secret')
  })


  test('serializes lock behind an in-flight vault write', async () => {
    const configDir = createTempDir()
    const vault = new SshCredentialVault(configDir)
    let releaseMasterPassword!: () => void
    const waitForRelease = new Promise<void>((resolve) => {
      releaseMasterPassword = resolve
    })

    const writePromise = vault.setServerSecrets(
      'server-race',
      { password: 'race-secret' },
      {
        requestSecret: async () => {
          await waitForRelease
          return { value: 'race-master-password' }
        },
      },
    )
    const lockPromise = vault.lock()
    releaseMasterPassword()

    await Promise.all([writePromise, lockPromise])
    expect((await vault.status()).unlocked).toBe(false)
    expect(
      (
        await vault.getServerSecrets('server-race', {
          requestSecret: async () => ({ value: 'race-master-password' }),
        })
      )?.password,
    ).toBe('race-secret')
  })

  test('can remove one credential without exposing or deleting the other', async () => {
    const configDir = createTempDir()
    const vault = new SshCredentialVault(configDir)
    const requestSecret: RequestSecretFn = async () => ({
      value: 'master-password',
    })
    await vault.setServerSecrets(
      'server-a',
      { password: 'password', passphrase: 'passphrase' },
      { requestSecret },
    )

    expect(
      await vault.clearServerSecret('server-a', 'password', { requestSecret }),
    ).toBe(true)
    expect(await vault.getServerSecrets('server-a', { requestSecret })).toMatchObject({
      passphrase: 'passphrase',
    })
    expect(
      (await vault.getServerSecrets('server-a', { requestSecret }))?.password,
    ).toBeUndefined()
  })
})
