import { getActiveTerminalCommandProcesses } from '@codebuff/sdk'

import { getTerminalWatchdogDiagnostics } from '../utils/terminal-watchdog'
import { getCliEnv } from '../utils/env'

export type ProcessDiagnosticsSnapshot = {
  product: string
  version: string
  runtime: string
  platform: string
  architecture: string
  uptimeSeconds: number
  cpuUserMicros: number
  cpuSystemMicros: number
  memory: NodeJS.MemoryUsage
  parentPid: number
  cliPid: number
  watchdog: {
    armed: boolean
    external: boolean
    pid?: number
  }
  activeTools: Array<{
    pid: number
    processGroupId?: number
  }>
}

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = units[0]
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024
    unit = units[i]
  }
  return `${value.toFixed(value >= 10 || unit === 'B' ? 0 : 1)} ${unit}`
}

const formatDuration = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':')
}

const formatWatchdog = (
  watchdog: ProcessDiagnosticsSnapshot['watchdog'],
): string => {
  if (watchdog.pid) return `PID ${watchdog.pid}`
  if (!watchdog.armed) return 'sin ejecutar'
  return watchdog.external
    ? 'activado externamente (PID no disponible en Windows)'
    : 'activado'
}

export function formatProcessDiagnostics(
  snapshot: ProcessDiagnosticsSnapshot,
): string {
  const cpuSeconds =
    (snapshot.cpuUserMicros + snapshot.cpuSystemMicros) / 1_000_000
  const lines = [
    `### Diagnóstico de procesos de ${snapshot.product}`,
    '',
    `- Versión: ${snapshot.version}`,
    `- Entorno de ejecución: ${snapshot.runtime}`,
    `- Plataforma: ${snapshot.platform} ${snapshot.architecture}`,
    `- Tiempo activo del CLI: ${formatDuration(snapshot.uptimeSeconds)}`,
    `- Tiempo de CPU del CLI: ${cpuSeconds.toFixed(1)} s`,
    `- Memoria del CLI: ${formatBytes(snapshot.memory.rss)} RSS, ${formatBytes(snapshot.memory.heapUsed)} de heap usada`,
    '',
    'Procesos:',
    `- proceso padre/contenedor: PID ${snapshot.parentPid}`,
    `- binario del CLI: PID ${snapshot.cliPid}`,
    `- supervisor de terminal: ${formatWatchdog(snapshot.watchdog)}`,
    '',
    'Herramientas de terminal activas:',
  ]

  if (snapshot.activeTools.length === 0) {
    lines.push('- ninguno')
  } else {
    for (const child of snapshot.activeTools) {
      lines.push(
        `- PID ${child.pid}${child.processGroupId ? `, PGID ${child.processGroupId}` : ''}`,
      )
    }
  }
  lines.push(
    '',
    'Las líneas de comandos y las variables de entorno se omiten por seguridad.',
  )
  return lines.join('\n')
}

export function collectProcessDiagnostics(): ProcessDiagnosticsSnapshot {
  const cpuUsage = process.cpuUsage()
  return {
    product: 'Codewolf',
    version: getCliEnv().CODEBUFF_CLI_VERSION ?? 'dev',
    runtime:
      typeof Bun !== 'undefined'
        ? `Bun ${Bun.version}`
        : `${process.release.name} ${process.version}`,
    platform: process.platform,
    architecture: process.arch,
    uptimeSeconds: process.uptime(),
    cpuUserMicros: cpuUsage.user,
    cpuSystemMicros: cpuUsage.system,
    memory: process.memoryUsage(),
    parentPid: process.ppid,
    cliPid: process.pid,
    watchdog: getTerminalWatchdogDiagnostics(),
    activeTools: getActiveTerminalCommandProcesses(),
  }
}
