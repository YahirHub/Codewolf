'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseBaselineMode,
  selectReleaseAsset,
} = require('../lib/platform.cjs')

const cases = [
  {
    name: 'Linux x64 AVX2 glibc',
    options: { platform: 'linux', arch: 'x64', avx2: true, musl: false },
    asset: 'codewolf-linux-x64.tar.gz',
  },
  {
    name: 'Linux x64 baseline glibc',
    options: { platform: 'linux', arch: 'x64', avx2: false, musl: false },
    asset: 'codewolf-linux-x64-baseline.tar.gz',
  },
  {
    name: 'Linux x64 baseline musl',
    options: { platform: 'linux', arch: 'x64', avx2: false, musl: true },
    asset: 'codewolf-linux-x64-musl-baseline.tar.gz',
  },
  {
    name: 'Linux ARM64 musl',
    options: { platform: 'linux', arch: 'arm64', musl: true },
    asset: 'codewolf-linux-arm64-musl.tar.gz',
  },
  {
    name: 'macOS ARM64',
    options: { platform: 'darwin', arch: 'arm64' },
    asset: 'codewolf-darwin-arm64.tar.gz',
  },
  {
    name: 'macOS x64 baseline',
    options: { platform: 'darwin', arch: 'x64', avx2: false },
    asset: 'codewolf-darwin-x64-baseline.tar.gz',
  },
  {
    name: 'Windows ARM64',
    options: { platform: 'win32', arch: 'arm64' },
    asset: 'codewolf-windows-arm64.zip',
  },
  {
    name: 'Windows x64 AVX2',
    options: { platform: 'win32', arch: 'x64', avx2: true },
    asset: 'codewolf-windows-x64.zip',
  },
  {
    name: 'Windows x64 baseline',
    options: { platform: 'win32', arch: 'x64', avx2: false },
    asset: 'codewolf-windows-x64-baseline.zip',
  },
]

for (const entry of cases) {
  test(`selectReleaseAsset: ${entry.name}`, () => {
    assert.equal(selectReleaseAsset(entry.options).preferred, entry.asset)
  })
}

test('optimized x64 builds may safely fall back to baseline', () => {
  const selection = selectReleaseAsset({
    platform: 'linux',
    arch: 'x64',
    avx2: true,
    musl: false,
  })
  assert.deepEqual(selection.candidates, [
    'codewolf-linux-x64.tar.gz',
    'codewolf-linux-x64-baseline.tar.gz',
  ])
})

test('baseline CPUs never fall back to an AVX2 build', () => {
  const selection = selectReleaseAsset({
    platform: 'linux',
    arch: 'x64',
    avx2: false,
    musl: false,
  })
  assert.deepEqual(selection.candidates, ['codewolf-linux-x64-baseline.tar.gz'])
})

test('CODEWOLF_BASELINE modes are parsed strictly', () => {
  assert.equal(parseBaselineMode('auto'), 'auto')
  assert.equal(parseBaselineMode('1'), true)
  assert.equal(parseBaselineMode('true'), true)
  assert.equal(parseBaselineMode('0'), false)
  assert.equal(parseBaselineMode('false'), false)
  assert.throws(() => parseBaselineMode('sometimes'), /CODEWOLF_BASELINE/)
})
