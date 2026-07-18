import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import AdmZip from 'adm-zip'

import { gitzipParams } from '@codebuff/common/tools/params/tool/gitzip'

import { executeGitzip, isGitzipRemoteAction } from '../gitzip'

import type { PersistentSshManager } from '../ssh-remote'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

const tempDirs: string[] = []

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-gitzip-'))
  tempDirs.push(directory)
  return directory
}

function valueOf(output: ToolResultOutput[]): Record<string, unknown> {
  const item = output[0]
  if (
    !item ||
    item.type !== 'json' ||
    !item.value ||
    typeof item.value !== 'object' ||
    Array.isArray(item.value)
  ) {
    throw new Error('Expected JSON object output')
  }
  return item.value as Record<string, unknown>
}

function tarNames(buffer: Buffer): string[] {
  const names: string[] = []
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header
      .subarray(345, 500)
      .toString('utf8')
      .replace(/\0.*$/, '')
    const type = String.fromCharCode(header[156] ?? 0)
    const sizeText = header
      .subarray(124, 136)
      .toString('ascii')
      .replace(/\0.*$/, '')
      .trim()
    const size = Number.parseInt(sizeText || '0', 8) || 0
    if (type !== 'x') names.push(prefix ? `${prefix}/${name}` : name)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return names
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('gitzip schema and capabilities', () => {
  test('validates local and remote operations', () => {
    expect(
      gitzipParams.inputSchema.parse({ action: 'create', source_path: '.' })
        .action,
    ).toBe('create')
    expect(
      gitzipParams.inputSchema.parse({
        action: 'remote_create',
        source_path: '/srv/app',
        connection_id: 'ssh-1',
      }).action,
    ).toBe('remote_create')
    expect(() =>
      gitzipParams.inputSchema.parse({
        action: 'upload',
        source_path: '.',
      }),
    ).toThrow('connection_id is required for upload')
  })

  test('classifies only SSH-backed actions as remote', () => {
    expect(isGitzipRemoteAction('create')).toBe(false)
    expect(isGitzipRemoteAction('upload')).toBe(true)
    expect(isGitzipRemoteAction('remote_create')).toBe(true)
    expect(isGitzipRemoteAction('remote_extract')).toBe(true)
  })
})

describe('local GitZip archives', () => {
  test('creates ZIP while honoring nested ignores and protecting .env', async () => {
    const root = tempDir()
    fs.mkdirSync(path.join(root, 'src', 'empty'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n*.log\n')
    fs.writeFileSync(path.join(root, 'src', '.gitignore'), 'private.txt\n')
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {}')
    fs.writeFileSync(path.join(root, 'src', 'private.txt'), 'ignored')
    fs.writeFileSync(path.join(root, 'debug.log'), 'ignored')
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=hidden')
    fs.writeFileSync(path.join(root, '.env.example'), 'SECRET=example')
    fs.writeFileSync(
      path.join(root, 'node_modules', 'pkg', 'index.js'),
      'ignored',
    )

    const result = valueOf(
      await executeGitzip({
        action: 'create',
        source_path: root,
        output_path: 'release.zip',
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.protected_env_excluded).toBe(1)

    const zip = new AdmZip(path.join(root, 'release.zip'))
    const names = zip.getEntries().map((entry) => entry.entryName)
    expect(names).toContain('.gitignore')
    expect(names).toContain('.env.example')
    expect(names).toContain('src/index.ts')
    expect(names).toContain('src/empty/')
    expect(names).not.toContain('.env')
    expect(names).not.toContain('debug.log')
    expect(names).not.toContain('src/private.txt')
    expect(names.some((name) => name.startsWith('node_modules/'))).toBe(false)
    expect(names).not.toContain('release.zip')
  })

  test('creates a portable TAR.GZ with the same manifest rules', async () => {
    const root = tempDir()
    fs.mkdirSync(path.join(root, 'app'), { recursive: true })
    fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n')
    fs.writeFileSync(path.join(root, 'app', 'main.txt'), 'ok')
    fs.writeFileSync(path.join(root, 'skip.tmp'), 'ignored')

    const output = path.join(root, 'release.tar.gz')
    const result = valueOf(
      await executeGitzip({
        action: 'create',
        source_path: root,
        output_path: output,
        format: 'tar.gz',
      }),
    )
    expect(result.ok).toBe(true)
    const names = tarNames(gunzipSync(await fsp.readFile(output)))
    expect(names).toContain('.gitignore')
    expect(names).toContain('app/')
    expect(names).toContain('app/main.txt')
    expect(names).not.toContain('skip.tmp')
    expect(names).not.toContain('release.tar.gz')
  })
})

describe('remote GitZip manifest', () => {
  test('creates tar from an explicit filtered manifest instead of recursive source paths', async () => {
    const calls: Array<Record<string, unknown>> = []
    const fakeManager = {
      async execute(
        input: Record<string, unknown>,
      ): Promise<ToolResultOutput[]> {
        calls.push(input)
        const action = input.action
        const remotePath = String(input.path ?? '')
        if (action === 'pwd') return [{ type: 'json', value: { path: '/srv' } }]
        if (action === 'read_file') {
          if (remotePath === '/srv/app/.gitignore') {
            return [{ type: 'json', value: { content: 'cache/\n*.log\n' } }]
          }
          return [{ type: 'json', value: { errorMessage: 'No such file' } }]
        }
        if (action === 'list' && remotePath === '/srv/app') {
          return [
            {
              type: 'json',
              value: {
                entries: [
                  {
                    name: '.gitignore',
                    type: 'file',
                    size: 14,
                    mode: 0o100644,
                  },
                  { name: 'index.js', type: 'file', size: 10, mode: 0o100644 },
                  { name: 'debug.log', type: 'file', size: 10, mode: 0o100644 },
                  { name: 'cache', type: 'directory', size: 0, mode: 0o040755 },
                  { name: '.env', type: 'file', size: 10, mode: 0o100600 },
                ],
              },
            },
          ]
        }
        if (action === 'write_file' || action === 'delete') {
          return [{ type: 'json', value: { ok: true } }]
        }
        if (action === 'exec') {
          return [
            { type: 'json', value: { exitCode: 0, stdout: '', stderr: '' } },
          ]
        }
        if (action === 'stat') {
          return [{ type: 'json', value: { size: 123 } }]
        }
        return [
          {
            type: 'json',
            value: {
              errorMessage: `Unexpected ${String(action)} ${remotePath}`,
            },
          },
        ]
      },
    } as unknown as PersistentSshManager

    const result = valueOf(
      await executeGitzip(
        {
          action: 'remote_create',
          source_path: '/srv/app',
          output_path: 'release.tar.gz',
          connection_id: 'ssh-prod',
        },
        undefined,
        { sshManager: fakeManager },
      ),
    )

    expect(result.ok).toBe(true)
    expect(result.files).toBe(2)
    expect(result.ignored_entries).toBe(2)
    expect(result.protected_env_excluded).toBe(1)
    const execCall = calls.find((call) => call.action === 'exec')
    expect(String(execCall?.command)).toContain('--no-recursion')
    expect(String(execCall?.command)).toContain('--null')
    expect(String(execCall?.command)).toContain('-T')
    expect(String(execCall?.command)).toContain('-czf')
    expect(String(execCall?.command)).not.toContain('-c-zf')
    expect(String(execCall?.command)).not.toContain('/srv/app/cache')
  })
})
