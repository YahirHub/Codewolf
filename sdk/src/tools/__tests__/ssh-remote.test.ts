import { describe, expect, test } from 'bun:test'

import { sshRemoteParams } from '@codebuff/common/tools/params/tool/ssh-remote'

import {
  PersistentSshManager,
  getPersistentSshManager,
  isSshRemoteSensitiveAction,
  normalizeSshConnectionId,
  resolveRemotePath,
} from '../ssh-remote'

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

  test('keeps read/navigation actions free and protects remote changes', () => {
    for (const action of [
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
    const manager = new PersistentSshManager()
    const result = await manager.execute({ action: 'status' })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') throw new Error('Expected JSON output')
    expect(result[0].value).toEqual({
      action: 'status',
      errorMessage: 'connection_id is required',
    })
  })

  test('lists and closes an empty connection registry', async () => {
    const manager = new PersistentSshManager()

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
