#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

const binaryName = process.platform === 'win32' ? 'codewolf.exe' : 'codewolf'
const binaryPath = path.resolve(__dirname, '..', 'runtime', binaryName)

if (!fs.existsSync(binaryPath)) {
  console.error(
    [
      'Codewolf no tiene un binario instalado para esta plataforma.',
      'Reinstala con:',
      '  npm i -g YahirHub/Codewolf',
      '',
      'Para forzar solo la descarga del binario durante una reinstalación:',
      '  CODEWOLF_NPM_INSTALL_BINARY=1 npm i -g YahirHub/Codewolf',
    ].join('\n'),
  )
  process.exit(1)
}

const child = spawn(binaryPath, process.argv.slice(2), {
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
