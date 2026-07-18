'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
)

test('GitHub npm install does not register lifecycle install scripts', () => {
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack']) {
    assert.equal(packageJson.scripts?.[script], undefined)
  }
})

test('global codewolf command points to the lazy runtime launcher', () => {
  assert.equal(packageJson.bin?.codewolf, './npm/bin/codewolf.cjs')
  const launcher = fs.readFileSync(path.join(root, 'npm', 'bin', 'codewolf.cjs'), 'utf8')
  assert.match(launcher, /ensureInstalled/)
})
