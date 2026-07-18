'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { extractArchive } = require('./archive.cjs')
const { selectReleaseAsset } = require('./platform.cjs')

const DEFAULT_REPOSITORY = 'YahirHub/Codewolf'

function log(message) {
  process.stdout.write(`[codewolf npm] ${message}\n`)
}

function parseChecksums(text) {
  const checksums = new Map()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (match) checksums.set(match[2].trim(), match[1].toLowerCase())
  }
  return checksums
}

function releaseBase(repository, release) {
  const repositoryMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository)
  if (
    !repositoryMatch ||
    repositoryMatch.slice(1).some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`CODEWOLF_REPOSITORY inválido: ${repository}`)
  }
  if (release === 'latest') {
    return `https://github.com/${repository}/releases/latest/download`
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(release)) {
    throw new Error(`CODEWOLF_RELEASE inválido: ${release}`)
  }
  return `https://github.com/${repository}/releases/download/${release}`
}

async function fetchWithRetry(url, options = {}) {
  const attempts = options.attempts ?? 3
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Codewolf-npm-installer',
          accept: 'application/octet-stream, text/plain;q=0.9, */*;q=0.8',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(`No se pudo descargar ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function downloadToFile(url, destination) {
  const response = await fetchWithRetry(url, { timeoutMs: 120_000 })
  if (!response.body) throw new Error(`La descarga no devolvió contenido: ${url}`)
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
}

function sha256File(file) {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(file)
  hash.update(data)
  return hash.digest('hex')
}

function chooseAvailableAsset(selection, checksums) {
  for (const candidate of selection.candidates) {
    if (checksums.has(candidate)) return candidate
  }
  throw new Error(
    `La release no contiene un binario compatible. Se buscó: ${selection.candidates.join(', ')}`,
  )
}

function validateExtractedRuntime(directory, binaryName) {
  const required = [binaryName, 'tree-sitter.wasm']
  for (const file of required) {
    const filePath = path.join(directory, file)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`El paquete descargado no contiene ${file}.`)
    }
  }
}

function replaceDirectoryAtomically(source, destination) {
  const backup = `${destination}.old-${process.pid}-${Date.now()}`
  if (fs.existsSync(destination)) fs.renameSync(destination, backup)
  try {
    fs.renameSync(source, destination)
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true })
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(destination)) {
      fs.renameSync(backup, destination)
    }
    throw error
  }
}

async function install(options = {}) {
  const packageRoot = options.packageRoot ?? path.resolve(__dirname, '..', '..')
  const repository = options.repository ?? process.env.CODEWOLF_REPOSITORY ?? DEFAULT_REPOSITORY
  const release = options.release ?? process.env.CODEWOLF_RELEASE ?? 'latest'
  const selection = options.selection ?? selectReleaseAsset()
  const baseUrl = options.baseUrl ?? releaseBase(repository, release)
  const checksumsUrl = `${baseUrl}/SHA256SUMS.txt`

  log(`Plataforma detectada: ${selection.target}`)
  log(`Consultando sumas SHA-256 de ${repository} (${release})...`)
  const checksumResponse = await fetchWithRetry(checksumsUrl)
  const checksums = parseChecksums(await checksumResponse.text())
  const asset = chooseAvailableAsset(selection, checksums)
  const expectedHash = checksums.get(asset)
  const assetUrl = `${baseUrl}/${asset}`

  if (asset !== selection.preferred) {
    log(`El asset optimizado no está disponible; usando fallback compatible: ${asset}`)
  }

  const npmDir = path.join(packageRoot, 'npm')
  const runtimeDir = path.join(npmDir, 'runtime')
  const tempRoot = fs.mkdtempSync(path.join(npmDir, '.install-'))
  const archivePath = path.join(tempRoot, asset)
  const extractedDir = path.join(tempRoot, 'runtime')

  try {
    log(`Descargando ${asset}...`)
    await downloadToFile(assetUrl, archivePath)

    const actualHash = sha256File(archivePath)
    if (actualHash !== expectedHash) {
      throw new Error(
        `SHA-256 inválido para ${asset}. Esperado ${expectedHash}, obtenido ${actualHash}.`,
      )
    }
    log('Integridad SHA-256 verificada.')

    extractArchive(archivePath, extractedDir, selection.extension)
    validateExtractedRuntime(extractedDir, selection.binaryName)

    const binaryPath = path.join(extractedDir, selection.binaryName)
    if (process.platform !== 'win32') fs.chmodSync(binaryPath, 0o755)

    const metadata = {
      repository,
      release,
      asset,
      sha256: actualHash,
      target: selection.target,
      installedAt: new Date().toISOString(),
    }
    fs.writeFileSync(
      path.join(extractedDir, 'install.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    )

    replaceDirectoryAtomically(extractedDir, runtimeDir)
    log(`Codewolf instalado: ${path.join(runtimeDir, selection.binaryName)}`)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

module.exports = {
  DEFAULT_REPOSITORY,
  chooseAvailableAsset,
  downloadToFile,
  fetchWithRetry,
  install,
  parseChecksums,
  releaseBase,
  sha256File,
}
