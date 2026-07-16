#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from 'child_process'
import { createRequire } from 'module'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { applyCliEnvironmentDefaults } from './cli-env-defaults'

type TargetInfo = {
  bunTarget: string
  platform: NodeJS.Platform
  arch: string
}

const VERBOSE = process.env.VERBOSE === 'true'
const OVERRIDE_TARGET = process.env.OVERRIDE_TARGET
const OVERRIDE_PLATFORM = process.env.OVERRIDE_PLATFORM as
  NodeJS.Platform | undefined
const OVERRIDE_ARCH = process.env.OVERRIDE_ARCH ?? undefined
const OVERRIDE_COMPILE_EXECUTABLE_PATH = process.env.BUN_COMPILE_EXECUTABLE_PATH
const SKIP_PREBUILD_AGENTS = process.env.CODEWOLF_SKIP_PREBUILD_AGENTS === 'true'
const SKIP_SDK_BUILD = process.env.CODEWOLF_SKIP_SDK_BUILD === 'true'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)
const bunExecutable = process.execPath

function log(message: string) {
  if (VERBOSE) {
    console.log(message)
  }
}

function logAlways(message: string) {
  console.log(message)
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: VERBOSE ? 'inherit' : 'pipe',
    env: { ...process.env, ...options.env },
    shell: false,
  })

  if (result.error) {
    throw new Error(
      `Could not start command "${command} ${args.join(' ')}": ${result.error.message}`,
    )
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.toString().trim() ?? ''
    const stderr = result.stderr?.toString().trim() ?? ''
    const details = [stdout, stderr].filter(Boolean).join('\n')
    const exitDescription =
      result.status === null
        ? `terminated${result.signal ? ` by signal ${result.signal}` : ''}`
        : `failed with exit code ${result.status}`

    throw new Error(
      `Command "${command} ${args.join(' ')}" ${exitDescription}${
        details ? `\n${details}` : ''
      }`,
    )
  }
}

function getTargetInfo(): TargetInfo {
  if (OVERRIDE_TARGET && OVERRIDE_PLATFORM && OVERRIDE_ARCH) {
    return {
      bunTarget: OVERRIDE_TARGET,
      platform: OVERRIDE_PLATFORM,
      arch: OVERRIDE_ARCH,
    }
  }

  const platform = process.platform
  const arch = process.arch

  const mappings: Record<string, TargetInfo> = {
    'linux-x64': { bunTarget: 'bun-linux-x64', platform: 'linux', arch: 'x64' },
    'linux-arm64': {
      bunTarget: 'bun-linux-arm64',
      platform: 'linux',
      arch: 'arm64',
    },
    'darwin-x64': {
      bunTarget: 'bun-darwin-x64',
      platform: 'darwin',
      arch: 'x64',
    },
    'darwin-arm64': {
      bunTarget: 'bun-darwin-arm64',
      platform: 'darwin',
      arch: 'arm64',
    },
    'win32-x64': {
      bunTarget: 'bun-windows-x64',
      platform: 'win32',
      arch: 'x64',
    },
    'win32-arm64': {
      bunTarget: 'bun-windows-arm64',
      platform: 'win32',
      arch: 'arm64',
    },
  }

  const key = `${platform}-${arch}`
  const target = mappings[key]

  if (!target) {
    throw new Error(`Unsupported build target: ${key}`)
  }

  return target
}

function getCliTargetLabel(targetInfo: TargetInfo): string {
  const labels = [targetInfo.platform, targetInfo.arch]
  if (targetInfo.bunTarget.includes('-musl')) labels.push('musl')
  if (targetInfo.bunTarget.endsWith('-baseline')) labels.push('baseline')
  if (targetInfo.bunTarget.endsWith('-modern')) labels.push('modern')
  return labels.join('-')
}

async function main() {
  // Standalone binaries must build without a repository-level .env file.
  // Explicit NEXT_PUBLIC_* values still win over these safe defaults.
  applyCliEnvironmentDefaults('prod')

  const [, , binaryNameArg, version] = process.argv
  const binaryName = binaryNameArg ?? 'codewolf'

  if (!version) {
    throw new Error('Version argument is required when building a binary')
  }

  log(`Building ${binaryName} @ ${version}`)

  const targetInfo = getTargetInfo()
  const binDir = join(cliRoot, 'bin')

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Generate bundled agents once. CI can reuse the result for a second target.
  if (!SKIP_PREBUILD_AGENTS) {
    log('Generating bundled agents...')
    runCommand(bunExecutable, ['run', 'scripts/prebuild-agents.ts'], {
      cwd: cliRoot,
      env: process.env,
    })
  } else {
    log('Reusing previously generated bundled agents')
  }

  // Build SDK assets once. CI can reuse them for a second target.
  if (!SKIP_SDK_BUILD) {
    log('Building SDK dependencies...')
    runCommand(bunExecutable, ['run', 'build'], {
      cwd: join(repoRoot, 'sdk'),
      env: process.env,
    })
  } else {
    log('Reusing previously built SDK dependencies')
  }

  patchOpenTuiAssetPaths()
  await ensureOpenTuiNativeBundle(targetInfo)

  const outputFilename =
    targetInfo.platform === 'win32' ? `${binaryName}.exe` : binaryName
  const outputFile = join(binDir, outputFilename)

  // Collect all NEXT_PUBLIC_* environment variables
  const nextPublicEnvVars = Object.entries(process.env)
    .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
    .map(([key, value]) => [`process.env.${key}`, `"${value ?? ''}"`])

  const defineFlags = [
    ['process.env.NODE_ENV', '"production"'],
    ['process.env.CODEBUFF_IS_BINARY', '"true"'], // Legacy internal compatibility
    ['process.env.CODEWOLF_IS_BINARY', '"true"'],
    ['process.env.CODEBUFF_CLI_VERSION', `"${version}"`], // Legacy internal compatibility
    ['process.env.CODEWOLF_CLI_VERSION', `"${version}"`],
    ['process.env.CODEBUFF_CLI_TARGET', `"${getCliTargetLabel(targetInfo)}"`], // Legacy internal compatibility
    ['process.env.CODEWOLF_CLI_TARGET', `"${getCliTargetLabel(targetInfo)}"`],
    ...nextPublicEnvVars,
  ]

  const buildArgs = [
    'build',
    'src/index.tsx',
    '--compile',
    '--production', // Required so compiled binaries use the production JSX runtime (avoids jsxDEV crashes).
    '--no-compile-autoload-bunfig', // User project bunfig.toml must not affect the standalone CLI.
    `--target=${targetInfo.bunTarget}`,
    ...(OVERRIDE_COMPILE_EXECUTABLE_PATH
      ? [`--compile-executable-path=${OVERRIDE_COMPILE_EXECUTABLE_PATH}`]
      : []),
    `--outfile=${outputFile}`,
    '--sourcemap=none',
    ...defineFlags.flatMap(([key, value]) => ['--define', `${key}=${value}`]),
    '--env=NEXT_PUBLIC_*', // Copies all current matching env vars into the compiled binary.
  ]

  log(
    `bun ${buildArgs
      .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
      .join(' ')}`,
  )

  runCommand(bunExecutable, buildArgs, { cwd: cliRoot })

  // Ship tree-sitter.wasm as a sibling file next to the binary. Bun
  // --compile asset embedding is unreliable on Windows (every JS-level
  // retrieval mechanism we tried — `with { type: 'file' }`, base64 string
  // literals, chunked base64, function-wrapped chunked base64 — got
  // tree-shaken, minified away, or returned an undefined binding even
  // when the bytes were in the binary). The pre-init reads it from
  // `dirname(process.execPath)`, which works the same on every platform
  // because it's a normal disk read, not a bunfs lookup.
  const sourceWasm = findWebTreeSitterWasm()
  const siblingWasm = join(binDir, 'tree-sitter.wasm')
  writeFileSync(siblingWasm, readFileSync(sourceWasm))
  logAlways(`Copied tree-sitter.wasm sibling: ${sourceWasm} → ${siblingWasm}`)

  if (targetInfo.platform !== 'win32') {
    chmodSync(outputFile, 0o755)
  }

  logAlways(`✅ Built ${outputFilename} (${getCliTargetLabel(targetInfo)})`)
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
})

/**
 * Find web-tree-sitter's tree-sitter.wasm in any plausible node_modules
 * layout — bun hoists differently across platforms and `bun install`
 * variants, and CI Windows lays it out differently than monorepo-root
 * installs.
 */
function findWebTreeSitterWasm(): string {
  const candidates = [
    join(cliRoot, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
    join(cliRoot, '..', 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
    join(
      cliRoot,
      '..',
      'sdk',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm',
    ),
  ]
  const found = candidates.find((p) => existsSync(p))
  if (found) return found
  try {
    const cliRequire = createRequire(join(cliRoot, 'package.json'))
    return cliRequire.resolve('web-tree-sitter/tree-sitter.wasm')
  } catch (err) {
    throw new Error(
      `Could not locate web-tree-sitter/tree-sitter.wasm. Searched:\n  - ` +
        candidates.join('\n  - ') +
        `\nAnd createRequire failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function patchOpenTuiAssetPaths() {
  const coreDir = [
    join(cliRoot, 'node_modules', '@opentui', 'core'),
    join(repoRoot, 'node_modules', '@opentui', 'core'),
  ].find((candidate) => existsSync(candidate))

  if (!coreDir) {
    log('OpenTUI core package not found; skipping asset patch')
    return
  }

  const indexFile = readdirSync(coreDir).find(
    (file) => file.startsWith('index') && file.endsWith('.js'),
  )

  if (!indexFile) {
    log('OpenTUI core index bundle not found; skipping asset patch')
    return
  }

  const indexPath = join(coreDir, indexFile)
  const content = readFileSync(indexPath, 'utf8')

  const absolutePathPattern =
    /var __dirname = ".*?packages\/core\/src\/lib\/tree-sitter\/assets";/
  if (!absolutePathPattern.test(content)) {
    log('OpenTUI core bundle already has relative asset paths')
    return
  }

  const replacement =
    'var __dirname = path3.join(path3.dirname(fileURLToPath(new URL(".", import.meta.url))), "lib/tree-sitter/assets");'

  const patched = content.replace(absolutePathPattern, replacement)
  writeFileSync(indexPath, patched)
  logAlways('Patched OpenTUI core tree-sitter asset paths')
}

async function ensureOpenTuiNativeBundle(targetInfo: TargetInfo) {
  const packageName = `@opentui/core-${targetInfo.platform}-${targetInfo.arch}`
  const packageFolder = `core-${targetInfo.platform}-${targetInfo.arch}`
  const packageDirs = [
    join(repoRoot, 'node_modules', '@opentui', packageFolder),
    join(cliRoot, 'node_modules', '@opentui', packageFolder),
  ]

  if (packageDirs.some((packageDir) => existsSync(packageDir))) {
    log(
      `OpenTUI native bundle already present for ${targetInfo.platform}-${targetInfo.arch}`,
    )
    return
  }

  const corePackagePath = [
    join(repoRoot, 'node_modules', '@opentui', 'core', 'package.json'),
    join(cliRoot, 'node_modules', '@opentui', 'core', 'package.json'),
  ].find((candidate) => existsSync(candidate))

  if (!corePackagePath) {
    throw new Error(
      'OpenTUI core package metadata is missing. Run "bun install --frozen-lockfile" from the repository root before building.',
    )
  }

  const corePackageJson = JSON.parse(readFileSync(corePackagePath, 'utf8')) as {
    optionalDependencies?: Record<string, string>
  }
  const version = corePackageJson.optionalDependencies?.[packageName]
  if (!version) {
    throw new Error(
      `OpenTUI does not declare the native package ${packageName} for this target.`,
    )
  }

  const opentuiPackagesDir = dirname(dirname(corePackagePath))
  const packageDir = join(opentuiPackagesDir, packageFolder)
  const registryBase =
    process.env.CODEWOLF_NPM_REGISTRY ??
    process.env.CODEBUFF_NPM_REGISTRY ?? // Legacy compatibility
    process.env.NPM_REGISTRY_URL ??
    'https://registry.npmjs.org'
  const metadataUrl = `${registryBase.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`
  log(`Fetching OpenTUI native bundle metadata from ${metadataUrl}`)

  const metadataResponse = await fetch(metadataUrl)
  if (!metadataResponse.ok) {
    throw new Error(
      `Failed to fetch metadata for ${packageName}: ${metadataResponse.status} ${metadataResponse.statusText}`,
    )
  }

  const metadataResponseBody = await metadataResponse.json()
  const metadata = metadataResponseBody as {
    versions?: Record<
      string,
      {
        dist?: {
          tarball?: string
        }
      }
    >
  }
  const tarballUrl = metadata.versions?.[version]?.dist?.tarball
  if (!tarballUrl) {
    throw new Error(`Tarball URL missing for ${packageName}@${version}`)
  }

  log(`Downloading OpenTUI native bundle from ${tarballUrl}`)
  const tarballResponse = await fetch(tarballUrl)
  if (!tarballResponse.ok) {
    throw new Error(
      `Failed to download ${packageName}@${version}: ${tarballResponse.status} ${tarballResponse.statusText}`,
    )
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'opentui-'))
  try {
    const tarballPath = join(
      tempDir,
      `${packageName.split('/').pop() ?? 'package'}-${version}.tgz`,
    )
    const tarballBuffer = await tarballResponse.arrayBuffer()
    await Bun.write(tarballPath, tarballBuffer)

    mkdirSync(opentuiPackagesDir, { recursive: true })
    mkdirSync(packageDir, { recursive: true })

    const tarballForTar =
      process.platform === 'win32'
        ? tarballPath.replace(/\\/g, '/')
        : tarballPath
    const extractDirForTar =
      process.platform === 'win32' ? packageDir.replace(/\\/g, '/') : packageDir

    const tarArgs = [
      '-xzf',
      tarballForTar,
      '--strip-components=1',
      '-C',
      extractDirForTar,
    ]
    if (process.platform === 'win32') {
      tarArgs.unshift('--force-local')
    }

    runCommand('tar', tarArgs)
    logAlways(
      `Fetched OpenTUI native bundle for ${targetInfo.platform}-${targetInfo.arch}`,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
