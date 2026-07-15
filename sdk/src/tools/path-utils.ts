import {
  getPathApi,
  isPathOutsideRoot,
  relativePath,
  resolvePathFromRoot,
} from '@codebuff/common/util/path-flavor'

export type ResolvedProjectPath = {
  fullPath: string
  relativePath: string
}

export type ResolvedFilePath = ResolvedProjectPath & {
  /** Whether the resolved path lives inside `projectRoot`. */
  isWithinProject: boolean
}

export function resolveFilePathWithinProject(
  projectRoot: string,
  filePath: string,
): ResolvedProjectPath | null {
  const fullPath = resolvePathFromRoot(projectRoot, filePath)
  const relative = relativePath(projectRoot, fullPath)

  if (
    relative === null ||
    relative === '' ||
    isPathOutsideRoot(projectRoot, fullPath)
  ) {
    return null
  }

  return { fullPath, relativePath: relative }
}

/**
 * Resolves a file path against the project root without restricting it to the
 * project directory. Absolute paths are honored as-is and relative paths are
 * resolved against the project root, including when the path syntax differs
 * from the host OS (for example POSIX paths on Windows-backed virtual filesystems).
 */
export function resolveFilePath(
  projectRoot: string,
  filePath: string,
): ResolvedFilePath {
  const fullPath = resolvePathFromRoot(projectRoot, filePath)
  const relative = relativePath(projectRoot, fullPath)
  const isWithinProject =
    relative !== null &&
    relative !== '' &&
    !isPathOutsideRoot(projectRoot, fullPath)

  return {
    fullPath,
    relativePath: isWithinProject ? relative : fullPath,
    isWithinProject,
  }
}

export function getProjectPathLookupKeys(
  projectRoot: string,
  filePath: string,
): string[] {
  const resolvedPath = resolveFilePathWithinProject(projectRoot, filePath)
  const keys = resolvedPath ? [resolvedPath.relativePath, filePath] : [filePath]

  return [...new Set(keys)]
}

export function dirnameForResolvedPath(filePath: string): string {
  const api = getPathApi(filePath)
  return api.dirname(filePath)
}
