#!/usr/bin/env node
'use strict'

// Manual helper retained for maintainers and explicit runtime refreshes.
// This file is intentionally NOT registered as an npm lifecycle script.
// Installing directly from a Git repository can make npm prepare the package
// in temporary directories; running a Node postinstall from that transient cwd
// can fail with ENOENT/uv_cwd. The normal global flow downloads the runtime
// lazily from npm/bin/codewolf.cjs on first execution instead.

const path = require('node:path')
const { install } = require('./lib/installer.cjs')

const packageRoot = path.resolve(__dirname, '..')

install({ packageRoot }).catch((error) => {
  console.error(
    `[codewolf npm] Error: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
})
