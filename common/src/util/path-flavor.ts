import path from 'node:path'

export type PathFlavor = 'posix' | 'win32' | 'native'

const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_ABSOLUTE = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/

export function getAbsolutePathFlavor(value: string): PathFlavor | null {
  if (WINDOWS_DRIVE_ABSOLUTE.test(value) || WINDOWS_UNC_ABSOLUTE.test(value)) {
    return 'win32'
  }
  if (value.startsWith('/')) {
    return 'posix'
  }
  return null
}

export function getPathFlavor(value: string): PathFlavor {
  return getAbsolutePathFlavor(value) ?? 'native'
}

export function getPathApi(value: string): path.PlatformPath {
  const flavor = getPathFlavor(value)
  if (flavor === 'win32') return path.win32
  if (flavor === 'posix') return path.posix
  return path
}

export function normalizePathSeparators(
  value: string,
  pathApi: path.PlatformPath,
): string {
  return pathApi === path.win32
    ? value.replace(/\//g, '\\')
    : value.replace(/\\/g, '/')
}

/**
 * Resolves a path using the syntax of the supplied root rather than the host OS.
 * This matters for SDK callers and tests that operate on a virtual filesystem
 * whose paths may use POSIX syntax while Codewolf itself runs on Windows.
 */
export function resolvePathFromRoot(root: string, value: string): string {
  const rootFlavor = getPathFlavor(root)
  const rootApi = getPathApi(root)
  const valueFlavor = getAbsolutePathFlavor(value)

  if (valueFlavor && valueFlavor !== rootFlavor) {
    const valueApi = valueFlavor === 'win32' ? path.win32 : path.posix
    return valueApi.resolve(normalizePathSeparators(value, valueApi))
  }

  const normalizedRoot = normalizePathSeparators(root, rootApi)
  const normalizedValue = normalizePathSeparators(value, rootApi)
  return rootApi.isAbsolute(normalizedValue)
    ? rootApi.resolve(normalizedValue)
    : rootApi.resolve(normalizedRoot, normalizedValue)
}

export function joinPath(root: string, ...parts: string[]): string {
  const api = getPathApi(root)
  return api.join(
    normalizePathSeparators(root, api),
    ...parts.map((part) => normalizePathSeparators(part, api)),
  )
}

export function dirnamePath(value: string): string {
  const api = getPathApi(value)
  return api.dirname(normalizePathSeparators(value, api))
}

export function relativePath(from: string, to: string): string | null {
  const fromFlavor = getPathFlavor(from)
  const toFlavor = getAbsolutePathFlavor(to) ?? fromFlavor
  if (fromFlavor !== 'native' && toFlavor !== fromFlavor) return null

  const api = getPathApi(from)
  return api.relative(
    normalizePathSeparators(from, api),
    normalizePathSeparators(to, api),
  )
}

export function isPathOutsideRoot(root: string, candidate: string): boolean {
  const api = getPathApi(root)
  const relative = relativePath(root, candidate)
  if (relative === null) return true
  return (
    relative === '..' ||
    relative.startsWith(`..${api.sep}`) ||
    api.isAbsolute(relative)
  )
}

export function toIgnorePath(value: string): string {
  return value.replace(/\\/g, '/')
}
