import { describe, expect, test } from 'bun:test'

import {
  createToolPermissionRequest,
  shouldRequestToolPermission,
} from '../tool-permission'

describe('tool permission classification', () => {
  test('only intercepts sensitive native tools and external tools', () => {
    expect(
      shouldRequestToolPermission({ toolName: 'run_terminal_command' }),
    ).toBe(true)
    expect(shouldRequestToolPermission({ toolName: 'write_file' })).toBe(true)
    expect(shouldRequestToolPermission({ toolName: 'gitzip' })).toBe(true)
    expect(shouldRequestToolPermission({ toolName: 'read_files' })).toBe(false)
    expect(
      shouldRequestToolPermission({
        toolName: 'server__deploy',
        externalTool: true,
      }),
    ).toBe(true)
  })

  test('classifies local and remote GitZip requests professionally', () => {
    const local = createToolPermissionRequest({
      toolCallId: 'tool-gitzip-local',
      toolName: 'gitzip',
      input: { action: 'create', source_path: '.', output_path: 'release.zip' },
      agentId: 'base2',
    })
    expect(local.scope).toBe('local')
    expect(local.category).toBe('file-create')
    expect(local.title).toContain('Comprimir proyecto')

    const remote = createToolPermissionRequest({
      toolCallId: 'tool-gitzip-remote',
      toolName: 'gitzip',
      input: {
        action: 'upload',
        source_path: '.',
        connection_id: 'ssh-prod',
        remote_path: '/srv/releases/app.tar.gz',
      },
      agentId: 'base2',
    })
    expect(remote.scope).toBe('ssh')
    expect(remote.category).toBe('remote-transfer')
    expect(remote.target).toBe('/srv/releases/app.tar.gz')
  })

  test('shows the command and the model-provided reason', () => {
    const request = createToolPermissionRequest({
      toolCallId: 'tool-1',
      toolName: 'run_terminal_command',
      input: {
        command: 'systemctl restart api',
        cwd: '/srv/api',
        reason: 'Reiniciar el servicio para aplicar el binario actualizado.',
      },
      agentId: 'base2',
    })

    expect(request.category).toBe('command')
    expect(request.target).toBe('systemctl restart api')
    expect(request.reason).toBe(
      'Reiniciar el servicio para aplicar el binario actualizado.',
    )
    expect(request.preview).toContain('/srv/api')
  })

  test('identifies file deletion through apply_patch', () => {
    const request = createToolPermissionRequest({
      toolCallId: 'tool-2',
      toolName: 'apply_patch',
      input: {
        reason: 'Eliminar una configuración retirada.',
        operation: { type: 'delete_file', path: 'config/legacy.json' },
      },
      agentId: 'editor',
      parentAgentId: 'base2',
    })

    expect(request.category).toBe('file-delete')
    expect(request.title).toBe('Eliminar archivo')
    expect(request.target).toBe('config/legacy.json')
    expect(request.parentAgentId).toBe('base2')
  })

  test('redacts likely secrets from external tool previews', () => {
    const request = createToolPermissionRequest({
      toolCallId: 'tool-3',
      toolName: 'production__deploy',
      input: {
        environment: 'production',
        apiKey: 'secret-value',
        nested: { authorization: 'Bearer hidden' },
      },
      agentId: 'base2',
      externalTool: true,
    })

    expect(request.preview).toContain('production')
    expect(request.preview).not.toContain('secret-value')
    expect(request.preview).not.toContain('Bearer hidden')
    expect(request.preview).toContain('[oculto]')
  })
})
