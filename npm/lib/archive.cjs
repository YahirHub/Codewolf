'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function safeRelativePath(rawName) {
  const normalized = rawName.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.') return null
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`Ruta absoluta no permitida en el paquete: ${rawName}`)
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) {
    throw new Error(`Ruta traversal no permitida en el paquete: ${rawName}`)
  }
  return parts.join('/')
}

function writeExtractedFile(destinationDir, relativeName, data, mode) {
  const safeName = safeRelativePath(relativeName)
  if (!safeName) return

  const destination = path.join(destinationDir, safeName)
  const resolvedRoot = path.resolve(destinationDir)
  const resolvedDestination = path.resolve(destination)
  if (
    resolvedDestination !== resolvedRoot &&
    !resolvedDestination.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Ruta fuera del destino: ${relativeName}`)
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, data)
  if (mode && process.platform !== 'win32') {
    fs.chmodSync(destination, mode & 0o777)
  }
}

function parseTarString(buffer, start, length) {
  return buffer
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '')
    .trim()
}

function parseTarOctal(buffer, start, length) {
  const value = parseTarString(buffer, start, length).replace(/\s/g, '')
  return value ? Number.parseInt(value, 8) : 0
}

function extractTarGz(archivePath, destinationDir) {
  const tar = zlib.gunzipSync(fs.readFileSync(archivePath))
  let offset = 0

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const name = parseTarString(header, 0, 100)
    const prefix = parseTarString(header, 345, 155)
    const fullName = prefix ? `${prefix}/${name}` : name
    const size = parseTarOctal(header, 124, 12)
    const mode = parseTarOctal(header, 100, 8)
    const type = String.fromCharCode(header[156] || 48)
    const dataStart = offset + 512
    const dataEnd = dataStart + size

    if (dataEnd > tar.length) {
      throw new Error(`Paquete tar truncado al extraer ${fullName}`)
    }

    if (type === '0' || type === '\0') {
      writeExtractedFile(
        destinationDir,
        fullName,
        tar.subarray(dataStart, dataEnd),
        mode,
      )
    } else if (type === '5') {
      const safeName = safeRelativePath(fullName)
      if (safeName) fs.mkdirSync(path.join(destinationDir, safeName), { recursive: true })
    } else if (!['x', 'g'].includes(type)) {
      // Release bundles only contain regular files/directories. Ignore metadata
      // types but reject links/devices by not materializing them.
    }

    offset = dataStart + Math.ceil(size / 512) * 512
  }
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50
  const minimum = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset
  }
  throw new Error('ZIP inválido: no se encontró el directorio central.')
}

function extractZip(archivePath, destinationDir) {
  const buffer = fs.readFileSync(archivePath)
  const eocd = findEndOfCentralDirectory(buffer)
  const totalEntries = buffer.readUInt16LE(eocd + 10)
  let centralOffset = buffer.readUInt32LE(eocd + 16)

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error('ZIP inválido: entrada de directorio central corrupta.')
    }

    const method = buffer.readUInt16LE(centralOffset + 10)
    const compressedSize = buffer.readUInt32LE(centralOffset + 20)
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24)
    const nameLength = buffer.readUInt16LE(centralOffset + 28)
    const extraLength = buffer.readUInt16LE(centralOffset + 30)
    const commentLength = buffer.readUInt16LE(centralOffset + 32)
    const externalAttributes = buffer.readUInt32LE(centralOffset + 38)
    const localOffset = buffer.readUInt32LE(centralOffset + 42)
    const name = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString('utf8')

    if (name.endsWith('/')) {
      const safeName = safeRelativePath(name)
      if (safeName) fs.mkdirSync(path.join(destinationDir, safeName), { recursive: true })
    } else {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`ZIP inválido: cabecera local corrupta para ${name}.`)
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize)

      let data
      if (method === 0) {
        data = compressed
      } else if (method === 8) {
        data = zlib.inflateRawSync(compressed)
      } else {
        throw new Error(`ZIP usa un método de compresión no compatible (${method}) para ${name}.`)
      }

      if (data.length !== uncompressedSize) {
        throw new Error(`ZIP corrupto: tamaño inesperado para ${name}.`)
      }

      const unixMode = (externalAttributes >>> 16) & 0xffff
      writeExtractedFile(destinationDir, name, data, unixMode)
    }

    centralOffset += 46 + nameLength + extraLength + commentLength
  }
}

function extractArchive(archivePath, destinationDir, extension) {
  fs.mkdirSync(destinationDir, { recursive: true })
  if (extension === 'zip') {
    extractZip(archivePath, destinationDir)
    return
  }
  if (extension === 'tar.gz') {
    extractTarGz(archivePath, destinationDir)
    return
  }
  throw new Error(`Formato de release no compatible: ${extension}`)
}

module.exports = {
  extractArchive,
  extractTarGz,
  extractZip,
  safeRelativePath,
}
