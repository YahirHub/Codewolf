import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { sshRemoteParams } from '@codebuff/common/tools/params/tool/ssh-remote'

import {
  SshServerStore,
  compactSshServerProfile,
  getSshServersPath,
} from '../ssh-server-store'
import {
  PersistentSshManager,
  getPersistentSshManager,
  isSshRemoteSensitiveAction,
  normalizeSshConnectionId,
  resolveRemotePath,
} from '../ssh-remote'

const tempDirs: string[] = []

function createTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-ssh-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('ssh_remote schema', () => {
  test('declares SSH results as serializable JSON objects', () => {
    const parsed = sshRemoteParams.outputSchema.parse([
      {
        type: 'json',
        value: {
          ok: true,
          connection: { id: 'ssh-1-example', port: 22 },
          entries: ['src', 'package.json'],
        },
      },
    ])

    expect(parsed[0]?.type).toBe('json')
  })

  test('allows listing the current remote directory without an explicit path', () => {
    const parsed = sshRemoteParams.inputSchema.parse({
      action: 'list',
      connection_id: 'ssh-1-example',
    })

    expect(parsed.path).toBeUndefined()
  })

  test('supports professional configured-server actions', () => {
    expect(
      sshRemoteParams.inputSchema.parse({ action: 'list_servers' }).action,
    ).toBe('list_servers')
    expect(
      sshRemoteParams.inputSchema.parse({
        action: 'add_server',
        host: 'server.example.com',
        username: 'deploy',
        private_key_path: '~/.ssh/id_ed25519',
      }).action,
    ).toBe('add_server')
    expect(
      sshRemoteParams.inputSchema.parse({
        action: 'rename_server',
        server_id: 'production',
        new_name: 'production-primary',
      }).action,
    ).toBe('rename_server')
  })

  test('does not allow literal secrets in persistent server profiles', () => {
    expect(() =>
      sshRemoteParams.inputSchema.parse({
        action: 'add_server',
        host: 'server.example.com',
        username: 'deploy',
        password: 'secret',
      }),
    ).toThrow()
  })
})

describe('SSH server registry', () => {
  test('migrates legacy labels and falls back to host when no name exists', async () => {
    const configDir = createTempDir()
    fs.writeFileSync(
      getSshServersPath(configDir),
      JSON.stringify({
        version: 1,
        servers: [
          {
            id: 'legacy-named',
            label: 'Producción antigua',
            host: 'prod.example.com',
            port: 22,
            username: 'deploy',
            password: 'must-not-survive',
          },
          {
            id: 'legacy-host-only',
            host: '10.0.0.8',
            username: 'root',
          },
        ],
      }),
    )

    const store = new SshServerStore(configDir)
    const profiles = await store.list()

    expect(compactSshServerProfile(profiles[0]!)).toMatchObject({
      server_id: 'legacy-named',
      name: 'Producción antigua',
      configured_name: 'Producción antigua',
      has_custom_name: true,
    })
    expect(compactSshServerProfile(profiles[1]!)).toMatchObject({
      server_id: 'legacy-host-only',
      name: '10.0.0.8',
      has_custom_name: false,
    })
    expect(JSON.stringify(profiles)).not.toContain('must-not-survive')
  })

  test('adds, resolves, updates, renames, and deletes global servers', async () => {
    const configDir = createTempDir()
    const store = new SshServerStore(configDir)

    const created = await store.add({
      name: 'staging',
      host: 'staging.example.com',
      username: 'deploy',
      private_key_path: '~/.ssh/id_ed25519',
    })
    expect((await store.get('staging')).id).toBe(created.id)
    expect((await store.get(`ssh-server://${created.id}`)).host).toBe(
      'staging.example.com',
    )

    const updated = await store.update(created.id, {
      port: 2222,
      password_env: 'STAGING_SSH_PASSWORD',
    })
    expect(updated.port).toBe(2222)
    expect(updated.password_env).toBe('STAGING_SSH_PASSWORD')

    const renamed = await store.rename(created.id, 'preproduction')
    expect(renamed.name).toBe('preproduction')

    const unnamed = await store.rename(created.id, undefined)
    expect(compactSshServerProfile(unnamed)).toMatchObject({
      name: 'staging.example.com',
      has_custom_name: false,
    })

    const deleted = await store.delete(created.id)
    expect(deleted.id).toBe(created.id)
    expect(await store.list()).toEqual([])
  })

  test('writes only non-secret authentication references', async () => {
    const configDir = createTempDir()
    const store = new SshServerStore(configDir)

    await store.add({
      host: 'secure.example.com',
      username: 'deploy',
      password_env: 'SSH_PASSWORD',
      passphrase_env: 'SSH_KEY_PASSPHRASE',
      private_key_path: '~/.ssh/id_ed25519',
    })

    const contents = fs.readFileSync(getSshServersPath(configDir), 'utf8')
    expect(contents).toContain('SSH_PASSWORD')
    expect(contents).toContain('id_ed25519')
    expect(contents).not.toContain('"password"')
    expect(contents).not.toContain('"private_key"')
    expect(contents).not.toContain('"passphrase"')
  })
})

describe('persistent SSH manager', () => {
  test('uses one process-wide connection registry', () => {
    expect(getPersistentSshManager()).toBe(getPersistentSshManager())
  })

  test('accepts both raw connection IDs and ssh references', () => {
    expect(normalizeSshConnectionId('ssh-1-example')).toBe('ssh-1-example')
    expect(normalizeSshConnectionId('ssh://ssh-1-example')).toBe(
      'ssh-1-example',
    )
  })

  test('resolves remote paths without leaking the local process directory', () => {
    expect(resolveRemotePath('.', 'logs/app.log')).toBe('logs/app.log')
    expect(resolveRemotePath('/srv/app', '../shared/file.txt')).toBe(
      '/srv/shared/file.txt',
    )
    expect(resolveRemotePath('/srv/app', '/etc/os-release')).toBe(
      '/etc/os-release',
    )
  })

  test('keeps registry/read/navigation actions free and protects changes', () => {
    for (const action of [
      'list_servers',
      'get_server',
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
    ] as const) {
      expect(isSshRemoteSensitiveAction(action)).toBe(false)
    }

    for (const action of [
      'connect',
      'connect_server',
      'add_server',
      'update_server',
      'rename_server',
      'delete_server',
      'exec',
      'shell_open',
      'shell_write',
      'upload',
      'download',
      'write_file',
      'mkdir',
      'rename',
      'delete',
    ] as const) {
      expect(isSshRemoteSensitiveAction(action)).toBe(true)
    }
  })

  test('normalizes undefined fields before returning a JSON result', async () => {
    const manager = new PersistentSshManager({ configDir: createTempDir() })
    const result = await manager.execute({ action: 'status' })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') throw new Error('Expected JSON output')
    expect(result[0].value).toEqual({
      action: 'status',
      errorMessage: 'connection_id is required',
    })
  })

  test('lists saved servers without inspecting project directories', async () => {
    const configDir = createTempDir()
    const store = new SshServerStore(configDir)
    await store.add({
      host: 'server.example.com',
      username: 'deploy',
      password_env: 'SERVER_PASSWORD',
    })

    const manager = new PersistentSshManager({ configDir })
    const listed = await manager.execute({ action: 'list_servers' })
    expect(listed[0]?.type).toBe('json')
    if (listed[0]?.type !== 'json') throw new Error('Expected JSON output')
    expect(listed[0].value).toMatchObject({
      configured_count: 1,
      servers: [
        {
          name: 'server.example.com',
          host: 'server.example.com',
          persistent: true,
        },
      ],
    })
  })

  test('lists and closes an empty connection registry', async () => {
    const manager = new PersistentSshManager({ configDir: createTempDir() })

    const listed = await manager.execute({ action: 'list_connections' })
    expect(listed[0]?.type).toBe('json')
    if (listed[0]?.type !== 'json') throw new Error('Expected JSON output')
    expect(listed[0].value).toMatchObject({ count: 0, connections: [] })

    const closed = await manager.execute({ action: 'close_all' })
    expect(closed[0]?.type).toBe('json')
    if (closed[0]?.type !== 'json') throw new Error('Expected JSON output')
    expect(closed[0].value).toMatchObject({
      count: 0,
      closed_connection_ids: [],
    })
  })
})
