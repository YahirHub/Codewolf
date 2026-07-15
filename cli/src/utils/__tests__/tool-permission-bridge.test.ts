import { afterEach, describe, expect, test } from 'bun:test'

import { ToolPermissionBridge } from '../tool-permission-bridge'

const request = (id: string) => ({
  toolCallId: id,
  toolName: 'run_terminal_command',
  input: { command: `echo ${id}` },
  agentId: 'base2',
  category: 'command' as const,
  title: 'Ejecutar comando',
  target: `echo ${id}`,
  reason: 'Validar el flujo.',
})

afterEach(() => {
  ToolPermissionBridge.resetForTests()
})

describe('ToolPermissionBridge', () => {
  test('serializes parallel requests in FIFO order', async () => {
    const seen: Array<string | null> = []
    const unsubscribe = ToolPermissionBridge.subscribe((pending) => {
      seen.push(pending?.toolCallId ?? null)
    })

    const first = ToolPermissionBridge.request(request('first'))
    const second = ToolPermissionBridge.request(request('second'))

    expect(ToolPermissionBridge.getPendingRequest()?.toolCallId).toBe('first')
    ToolPermissionBridge.respond('allow')
    expect((await first).decision).toBe('allow')
    expect(ToolPermissionBridge.getPendingRequest()?.toolCallId).toBe('second')

    ToolPermissionBridge.respond('deny')
    expect((await second).decision).toBe('deny')
    expect(ToolPermissionBridge.getPendingRequest()).toBeNull()
    expect(seen).toContain('first')
    expect(seen).toContain('second')
    unsubscribe()
  })

  test('denies an active request when its run is aborted', async () => {
    const controller = new AbortController()
    const pending = ToolPermissionBridge.request(
      request('abort-me'),
      controller.signal,
    )

    controller.abort()

    const result = await pending
    expect(result.decision).toBe('deny')
    expect(result.message).toContain('cancelada')
    expect(ToolPermissionBridge.getPendingRequest()).toBeNull()
  })
})
