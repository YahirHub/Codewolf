#!/usr/bin/env node
'use strict'

const { install } = require('./lib/installer.cjs')

function envEnabled(name) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env[name] ?? '').trim().toLowerCase(),
  )
}

const userAgent = String(process.env.npm_config_user_agent ?? '')
const isNpm = userAgent.startsWith('npm/')
const isGlobal = String(process.env.npm_config_global ?? '').toLowerCase() === 'true'
const force = envEnabled('CODEWOLF_NPM_INSTALL_BINARY')
const skip = envEnabled('CODEWOLF_NPM_SKIP_DOWNLOAD')

if (skip) {
  console.log('[codewolf npm] Descarga omitida por CODEWOLF_NPM_SKIP_DOWNLOAD.')
  process.exit(0)
}

// `bun install` is the development workflow for this monorepo. Do not download
// release binaries during normal development. The GitHub npm installation path
// is intentionally global: `npm i -g YahirHub/Codewolf`.
if (!force && (!isNpm || !isGlobal)) {
  console.log(
    '[codewolf npm] Instalador binario omitido (solo se ejecuta automáticamente con npm global).',
  )
  process.exit(0)
}

install().catch((error) => {
  console.error(
    `[codewolf npm] Error: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
})
