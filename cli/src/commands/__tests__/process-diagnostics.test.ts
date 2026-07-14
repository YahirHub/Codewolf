import { describe, expect, test } from 'bun:test'

import {
  collectProcessDiagnostics,
  formatProcessDiagnostics,
} from '../process-diagnostics'

import type { ProcessDiagnosticsSnapshot } from '../process-diagnostics'

const snapshot: ProcessDiagnosticsSnapshot = {
  product: 'Freebuff',
  version: '1.2.3',
  runtime: 'Bun 1.3.14',
  platform: 'darwin',
  architecture: 'arm64',
  uptimeSeconds: 3_661,
  cpuUserMicros: 1_500_000,
  cpuSystemMicros: 500_000,
  memory: {
    rss: 100 * 1024 * 1024,
    heapTotal: 50 * 1024 * 1024,
    heapUsed: 25 * 1024 * 1024,
    external: 0,
    arrayBuffers: 0,
  },
  parentPid: 100,
  cliPid: 200,
  watchdog: { armed: true, external: false, pid: 250 },
  activeTools: [{ pid: 300, processGroupId: 300 }],
}

describe('process diagnostics', () => {
  test('formats owned process IDs without sensitive command data', () => {
    const output = formatProcessDiagnostics(snapshot)

    expect(output).toContain('### Diagnóstico de procesos de Freebuff')
    expect(output).toContain('Tiempo activo del CLI: 01:01:01')
    expect(output).toContain('proceso padre/contenedor: PID 100')
    expect(output).toContain('binario del CLI: PID 200')
    expect(output).toContain('supervisor de terminal: PID 250')
    expect(output).toContain('PID 300, PGID 300')
    expect(output).toContain(
      'Las líneas de comandos y las variables de entorno se omiten',
    )
  })

  test('collects runtime-local process information', () => {
    const result = collectProcessDiagnostics()

    expect(result.cliPid).toBe(process.pid)
    expect(result.parentPid).toBe(process.ppid)
    expect(result.memory.rss).toBeGreaterThan(0)
  })
})
