'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const {
  extractArchive,
  safeRelativePath,
} = require('../lib/archive.cjs')

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
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function makeTarGz(entries) {
  const chunks = []
  for (const [name, content] of entries) {
    const data = Buffer.from(content)
    chunks.push(tarHeader(name, data.length))
    chunks.push(data)
    const padding = (512 - (data.length % 512)) % 512
    if (padding) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return zlib.gzipSync(Buffer.concat(chunks))
}

function makeZip(entries, method = 0) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name)
    const data = Buffer.from(content)
    const compressed = method === 8 ? zlib.deflateRawSync(data) : data
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuffer, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuffer)

    offset += local.length + nameBuffer.length + compressed.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const localBuffer = Buffer.concat(locals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(localBuffer.length, 16)
  return Buffer.concat([localBuffer, centralBuffer, eocd])
}

function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-npm-test-'))
  try {
    callback(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('extractArchive extracts release-style tar.gz files', () => {
  withTempDir((directory) => {
    const archive = path.join(directory, 'codewolf.tar.gz')
    const output = path.join(directory, 'out')
    fs.writeFileSync(
      archive,
      makeTarGz([
        ['./codewolf', 'binary'],
        ['./tree-sitter.wasm', 'wasm'],
      ]),
    )
    extractArchive(archive, output, 'tar.gz')
    assert.equal(fs.readFileSync(path.join(output, 'codewolf'), 'utf8'), 'binary')
    assert.equal(
      fs.readFileSync(path.join(output, 'tree-sitter.wasm'), 'utf8'),
      'wasm',
    )
  })
})

test('extractArchive extracts release-style zip files', () => {
  withTempDir((directory) => {
    const archive = path.join(directory, 'codewolf.zip')
    const output = path.join(directory, 'out')
    fs.writeFileSync(
      archive,
      makeZip([
        ['codewolf.exe', 'binary'],
        ['tree-sitter.wasm', 'wasm'],
      ]),
    )
    extractArchive(archive, output, 'zip')
    assert.equal(fs.readFileSync(path.join(output, 'codewolf.exe'), 'utf8'), 'binary')
    assert.equal(
      fs.readFileSync(path.join(output, 'tree-sitter.wasm'), 'utf8'),
      'wasm',
    )
  })
})


test('extractArchive extracts deflated zip files used by Windows releases', () => {
  withTempDir((directory) => {
    const archive = path.join(directory, 'codewolf-deflated.zip')
    const output = path.join(directory, 'out')
    fs.writeFileSync(
      archive,
      makeZip(
        [
          ['codewolf.exe', 'binary-binary-binary-binary'],
          ['tree-sitter.wasm', 'wasm-wasm-wasm-wasm'],
        ],
        8,
      ),
    )
    extractArchive(archive, output, 'zip')
    assert.equal(
      fs.readFileSync(path.join(output, 'codewolf.exe'), 'utf8'),
      'binary-binary-binary-binary',
    )
    assert.equal(
      fs.readFileSync(path.join(output, 'tree-sitter.wasm'), 'utf8'),
      'wasm-wasm-wasm-wasm',
    )
  })
})

test('archive paths cannot escape the runtime directory', () => {
  assert.throws(() => safeRelativePath('../secret'), /traversal/)
  assert.throws(() => safeRelativePath('/etc/passwd'), /absoluta/)
  assert.throws(() => safeRelativePath('C:/Windows/System32'), /absoluta/)
})
