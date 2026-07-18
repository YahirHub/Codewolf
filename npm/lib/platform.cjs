'use strict'

const fs = require('node:fs')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

function normalizeArchitecture(arch) {
  if (arch === 'x64' || arch === 'amd64') return 'x64'
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64'
  throw new Error(`Arquitectura no compatible: ${arch}`)
}

function parseBaselineMode(value = 'auto') {
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  if (normalized === 'auto' || normalized === '') return 'auto'
  throw new Error('CODEWOLF_BASELINE debe ser auto, 1 o 0.')
}

function supportsAvx2(platform = process.platform) {
  try {
    if (platform === 'linux') {
      const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8')
      return /(?:^|\s)avx2(?:\s|$)/im.test(cpuInfo)
    }

    if (platform === 'darwin') {
      const output = execFileSync('sysctl', ['-a'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return /AVX2/i.test(output)
    }

    if (platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[System.Runtime.Intrinsics.X86.Avx2]::IsSupported',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      return output.trim().toLowerCase() === 'true'
    }
  } catch {
    // Falling back to baseline is safer than selecting an AVX2-only build.
  }

  return false
}

function isMuslLinux() {
  if (process.platform !== 'linux') return false
  if (fs.existsSync('/etc/alpine-release')) return true

  try {
    const report = process.report?.getReport?.()
    const glibcVersion = report?.header?.glibcVersionRuntime
    if (typeof glibcVersion === 'string' && glibcVersion.length > 0) {
      return false
    }
  } catch {
    // Continue with ldd detection.
  }

  try {
    const output = execFileSync('ldd', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (/musl/i.test(output)) return true
    if (/glibc|gnu libc/i.test(output)) return false
  } catch (error) {
    const stderr = error && typeof error === 'object' ? error.stderr : undefined
    if (typeof stderr === 'string' && /musl/i.test(stderr)) return true
  }

  return false
}

function selectReleaseAsset(options = {}) {
  const platform = options.platform ?? process.platform
  const architecture = normalizeArchitecture(options.arch ?? process.arch)
  const baselineMode = parseBaselineMode(
    options.baselineMode ?? process.env.CODEWOLF_BASELINE ?? 'auto',
  )

  if (!['linux', 'darwin', 'win32'].includes(platform)) {
    throw new Error(`Sistema operativo no compatible: ${platform}`)
  }

  const baseline =
    architecture === 'x64'
      ? baselineMode === 'auto'
        ? !(options.avx2 ?? supportsAvx2(platform))
        : baselineMode
      : false

  const musl =
    platform === 'linux' ? (options.musl ?? isMuslLinux()) : false

  const platformName = platform === 'win32' ? 'windows' : platform
  const libcSuffix = platform === 'linux' && musl ? '-musl' : ''
  const baselineSuffix = baseline ? '-baseline' : ''
  const extension = platform === 'win32' ? 'zip' : 'tar.gz'
  const target = `${platformName}-${architecture}${libcSuffix}${baselineSuffix}`
  const preferred = `codewolf-${target}.${extension}`

  // A baseline build is compatible with AVX2-capable x64 CPUs, so it is a safe
  // fallback when a release accidentally omits the optimized asset. The inverse
  // fallback is intentionally forbidden because it could crash on old CPUs.
  const candidates = [preferred]
  if (architecture === 'x64' && !baseline) {
    candidates.push(
      `codewolf-${platformName}-${architecture}${libcSuffix}-baseline.${extension}`,
    )
  }

  return {
    platform,
    platformName,
    architecture,
    baseline,
    musl,
    extension,
    binaryName: platform === 'win32' ? 'codewolf.exe' : 'codewolf',
    target,
    preferred,
    candidates,
  }
}

module.exports = {
  isMuslLinux,
  normalizeArchitecture,
  parseBaselineMode,
  selectReleaseAsset,
  supportsAvx2,
}
