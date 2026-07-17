import { describe, expect, test } from 'bun:test'

import {
  findProtectedEnvFilePath,
  inputMentionsProtectedEnv,
  isProtectedEnvFilePath,
  toolMayReadProtectedEnv,
} from '../util/protected-env'
import {
  createEnvReadPermissionRequest,
  createToolPermissionRequest,
  shouldRequestToolPermission,
} from '../util/tool-permission'

describe('protected environment files', () => {
  test('protects real environment files but allows templates', () => {
    expect(isProtectedEnvFilePath('.env')).toBe(true)
    expect(isProtectedEnvFilePath('.env*')).toBe(true)
    expect(isProtectedEnvFilePath('**/.env.*')).toBe(true)
    expect(isProtectedEnvFilePath('server/.env.production')).toBe(true)
    expect(isProtectedEnvFilePath('C:\\app\\.env.local')).toBe(true)
    expect(isProtectedEnvFilePath('.env.example')).toBe(false)
    expect(isProtectedEnvFilePath('.env.sample')).toBe(false)
    expect(isProtectedEnvFilePath('docs/env.md')).toBe(false)
  })

  test('prompts only when a tool can expose protected contents', () => {
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: { action: 'stat', path: '.env.production' },
      }),
    ).toBe(false)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: { action: 'connect', private_key_path: '.env.local' },
      }),
    ).toBe(true)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: {
          action: 'connect_server',
          server_id: 'production',
          private_key_path: '.env.local',
        },
      }),
    ).toBe(true)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: { action: 'read_file', path: '.env.production' },
      }),
    ).toBe(true)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: {
          action: 'upload',
          local_path: '.env.local',
          remote_path: '/srv/app/config',
        },
      }),
    ).toBe(true)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'ssh_remote',
        input: {
          action: 'upload',
          local_path: 'config.txt',
          remote_path: '/srv/app/.env',
        },
      }),
    ).toBe(false)
    expect(
      toolMayReadProtectedEnv({
        toolName: 'write_file',
        input: { path: '.env', content: 'GENERATED=true' },
      }),
    ).toBe(false)
  })

  test('detects protected env paths inside nested tool input', () => {
    const input = {
      action: 'exec',
      command: 'cat --file=./config/.env.production',
    }
    expect(inputMentionsProtectedEnv(input)).toBe(true)
    expect(findProtectedEnvFilePath(input)).toBe('./config/.env.production')
    expect(
      findProtectedEnvFilePath({ command: 'cat .env.local;echo done' }),
    ).toBe('.env.local')
    expect(
      inputMentionsProtectedEnv({
        paths: ['README.md', '.env.example'],
      }),
    ).toBe(false)
  })

  test('selects the actual protected source path for upload warnings', () => {
    expect(
      findProtectedEnvFilePath({
        action: 'upload',
        local_path: 'config/.env.local',
        remote_path: '/srv/app/config',
      }),
    ).toBe('config/.env.local')
  })
})

describe('tool permission requests', () => {
  test('marks mutating native and external tools as sensitive', () => {
    expect(
      shouldRequestToolPermission({ toolName: 'run_terminal_command' }),
    ).toBe(true)
    expect(shouldRequestToolPermission({ toolName: 'read_files' })).toBe(false)
    expect(
      shouldRequestToolPermission({
        toolName: 'custom_remote_tool',
        externalTool: true,
      }),
    ).toBe(true)
  })

  test('describes SSH permission without exposing credentials', () => {
    const request = createToolPermissionRequest({
      toolCallId: 'call-1',
      toolName: 'ssh_remote',
      input: {
        action: 'connect',
        host: 'server.example.com',
        username: 'deploy',
        password: 'super-secret',
      },
      agentId: 'base',
    })

    expect(request.scope).toBe('ssh')
    expect(request.category).toBe('remote-connect')
    expect(request.target).toBe('deploy@server.example.com')
    expect(request.preview).toContain('[oculto]')
    expect(request.preview).not.toContain('super-secret')
    expect(JSON.stringify(request.input)).not.toContain('super-secret')
  })

  test('describes saved-server mutations and direct connection persistence', () => {
    const addRequest = createToolPermissionRequest({
      toolCallId: 'call-add-server',
      toolName: 'ssh_remote',
      input: {
        action: 'add_server',
        name: 'production',
        host: 'server.example.com',
        username: 'deploy',
        password_env: 'PRODUCTION_SSH_PASSWORD',
      },
      agentId: 'base',
    })
    expect(addRequest.category).toBe('remote-config')
    expect(addRequest.title).toBe('Guardar servidor SSH')
    expect(addRequest.target).toBe('production')

    const connectRequest = createToolPermissionRequest({
      toolCallId: 'call-connect-save',
      toolName: 'ssh_remote',
      input: {
        action: 'connect',
        host: 'server.example.com',
        username: 'deploy',
        password_env: 'PRODUCTION_SSH_PASSWORD',
      },
      agentId: 'base',
    })
    expect(connectRequest.title).toBe('Abrir y guardar conexión SSH')
  })

  test('redacts secret assignments embedded in command previews', () => {
    const request = createToolPermissionRequest({
      toolCallId: 'call-command-secret',
      toolName: 'run_terminal_command',
      input: {
        command: 'OPENAI_API_KEY=sk-secret bun run deploy',
      },
      agentId: 'base',
    })

    expect(request.target).toContain('[oculto]')
    expect(request.target).not.toContain('sk-secret')
    expect(JSON.stringify(request.input)).not.toContain('sk-secret')
  })

  test('creates a dedicated warning for .env content', () => {
    const request = createEnvReadPermissionRequest({
      toolCallId: 'call-env',
      toolName: 'read_files',
      filePath: '.env.local',
    })

    expect(request.category).toBe('file-read')
    expect(request.operation).toBe('read_env')
    expect(request.target).toBe('.env.local')
  })
})
