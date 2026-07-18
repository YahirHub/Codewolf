'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  chooseAvailableAsset,
  parseChecksums,
  releaseBase,
} = require('../lib/installer.cjs')

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)

test('parseChecksums reads GNU sha256sum manifests', () => {
  const checksums = parseChecksums(
    `${hashA}  codewolf-linux-x64.tar.gz\n${hashB} *codewolf-windows-x64.zip\n`,
  )
  assert.equal(checksums.get('codewolf-linux-x64.tar.gz'), hashA)
  assert.equal(checksums.get('codewolf-windows-x64.zip'), hashB)
})

test('chooseAvailableAsset uses a safe baseline fallback', () => {
  const selection = {
    candidates: [
      'codewolf-linux-x64.tar.gz',
      'codewolf-linux-x64-baseline.tar.gz',
    ],
  }
  const checksums = new Map([
    ['codewolf-linux-x64-baseline.tar.gz', hashA],
  ])
  assert.equal(
    chooseAvailableAsset(selection, checksums),
    'codewolf-linux-x64-baseline.tar.gz',
  )
})

test('releaseBase supports latest and explicit numeric tags', () => {
  assert.equal(
    releaseBase('YahirHub/Codewolf', 'latest'),
    'https://github.com/YahirHub/Codewolf/releases/latest/download',
  )
  assert.equal(
    releaseBase('YahirHub/Codewolf', '1.0.9'),
    'https://github.com/YahirHub/Codewolf/releases/download/1.0.9',
  )
})

test('releaseBase rejects unsafe repository or release values', () => {
  assert.throws(() => releaseBase('../repo', 'latest'), /REPOSITORY/)
  assert.throws(() => releaseBase('YahirHub/Codewolf', '../tag'), /RELEASE/)
})

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { install } = require('../lib/installer.cjs')

function tarHeader(name, size, mode = 0o755) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.fill(0x20, 148, 156)
  header[156] = '0'.charCodeAt(0)
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function makeTarGz(entries) {
  const chunks = []
  for (const [name, content] of entries) {
    const data = Buffer.from(content)
    chunks.push(tarHeader(name, data.length), data)
    const padding = (512 - (data.length % 512)) % 512
    if (padding) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return zlib.gzipSync(Buffer.concat(chunks))
}

test('install downloads, verifies and installs a release runtime', async () => {
  const asset = 'codewolf-linux-x64.tar.gz'
  const archive = makeTarGz([
    ['./codewolf', '#!/bin/sh\necho codewolf\n'],
    ['./tree-sitter.wasm', 'wasm'],
    ['./LICENSE', 'license'],
  ])
  const hash = crypto.createHash('sha256').update(archive).digest('hex')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-installer-'))
  fs.mkdirSync(path.join(root, 'npm'), { recursive: true })

  const server = http.createServer((request, response) => {
    if (request.url === '/SHA256SUMS.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(`${hash}  ${asset}\n`)
      return
    }
    if (request.url === `/${asset}`) {
      response.writeHead(200, { 'content-type': 'application/gzip' })
      response.end(archive)
      return
    }
    response.writeHead(404)
    response.end('not found')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  try {
    await install({
      packageRoot: root,
      repository: 'YahirHub/Codewolf',
      release: 'latest',
      baseUrl: `http://127.0.0.1:${address.port}`,
      selection: {
        target: 'linux-x64',
        candidates: [asset],
        preferred: asset,
        extension: 'tar.gz',
        binaryName: 'codewolf',
      },
    })

    const runtime = path.join(root, 'npm', 'runtime')
    assert.equal(
      fs.readFileSync(path.join(runtime, 'tree-sitter.wasm'), 'utf8'),
      'wasm',
    )
    const metadata = JSON.parse(
      fs.readFileSync(path.join(runtime, 'install.json'), 'utf8'),
    )
    assert.equal(metadata.asset, asset)
    assert.equal(metadata.sha256, hash)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
