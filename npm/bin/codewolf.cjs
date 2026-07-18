#!/usr/bin/env node
'use strict'

const os = require('node:os')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { ensureInstalled } = require('../lib/installer.cjs')

async function main() {
  const packageRoot = path.resolve(__dirname, '..', '..')

  let runtime
  try {
    runtime = await ensureInstalled({ packageRoot })
  } catch (error) {
    console.error(
      `[codewolf npm] No se pudo preparar el binario: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    process.exit(1)
  }

  const child = spawn(runtime.binaryPath, process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  })

  const forwardedSignals = new Map()
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => {
      if (!child.killed) {
        try {
          child.kill(signal)
        } catch {
          // The child may already be terminating.
        }
      }
    }
    forwardedSignals.set(signal, handler)
    process.on(signal, handler)
  }

  function removeSignalHandlers() {
    for (const [signal, handler] of forwardedSignals) {
      process.off(signal, handler)
    }
  }

  child.on('error', (error) => {
    removeSignalHandlers()
    console.error(`No se pudo iniciar Codewolf: ${error.message}`)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    removeSignalHandlers()
    if (typeof code === 'number') {
      process.exit(code)
    }
    if (signal) {
      const signalNumber = os.constants.signals?.[signal]
      process.exit(typeof signalNumber === 'number' ? 128 + signalNumber : 1)
    }
    process.exit(1)
  })
}

main().catch((error) => {
  console.error(
    `[codewolf npm] Error inesperado: ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  process.exit(1)
})
