import { existsSync, statSync } from 'fs'

import { useCallback } from 'react'

import {
  getPathApi,
  isPathOutsideRoot,
  joinPath,
  relativePath,
} from '@codebuff/common/util/path-flavor'

import { getPathCompletion } from '../utils/path-completion'

export interface UsePathTabCompletionOptions {
  /** Current search query */
  searchQuery: string
  /** Set the search query */
  setSearchQuery: (query: string) => void
  /** Current directory path */
  currentPath: string
  /** Set the current directory path */
  setCurrentPath: (path: string) => void
  /** Function to expand ~ to home directory */
  expandPath: (inputPath: string) => string
}

export interface UsePathTabCompletionReturn {
  /** Handle tab completion, returns true to indicate key was handled */
  handleTabCompletion: () => boolean
}

export function toRelativeCompletionPath(
  completed: string,
  currentPath: string,
): string | null {
  const relative = relativePath(currentPath, completed)
  if (relative === null || relative === '') return null
  const pathApi = getPathApi(currentPath)
  if (
    isPathOutsideRoot(currentPath, completed) ||
    pathApi.isAbsolute(relative)
  ) {
    return null
  }
  return relative
}

function hasTrailingSeparator(value: string): boolean {
  return value.endsWith('/') || value.endsWith('\\')
}

/**
 * Hook for path tab completion.
 * Handles both absolute (/, ~) and relative path completion.
 * Always navigates to completed directories when completion ends with /.
 */
export function usePathTabCompletion({
  searchQuery,
  setSearchQuery,
  currentPath,
  setCurrentPath,
  expandPath,
}: UsePathTabCompletionOptions): UsePathTabCompletionReturn {
  const handleTabCompletion = useCallback((): boolean => {
    if (searchQuery.startsWith('/') || searchQuery.startsWith('~')) {
      // Absolute path completion
      const completed = getPathCompletion(searchQuery)
      if (completed) {
        // If completion is a full directory (ends with /), navigate there and keep the path in input
        if (hasTrailingSeparator(completed)) {
          const dirPath = expandPath(completed.slice(0, -1))
          try {
            if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
              setCurrentPath(dirPath)
              setSearchQuery(completed)
              return true
            }
          } catch {
            // Fall through to just set the query
          }
        }
        setSearchQuery(completed)
      }
    } else if (searchQuery.length > 0) {
      // Relative path completion - try from current directory
      const candidatePath = joinPath(currentPath, searchQuery)
      const completed = getPathCompletion(candidatePath)
      if (completed) {
        // If completion is a full directory (ends with /), navigate there and keep the path in input
        if (hasTrailingSeparator(completed)) {
          try {
            const dirPath = completed.slice(0, -1)
            if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
              setCurrentPath(dirPath)
              setSearchQuery(completed)
              return true
            }
          } catch {
            // Fall through to just set the query
          }
        }
        // Convert back to a relative path only when the completion is inside
        // the active directory. Keep external completions unchanged.
        setSearchQuery(
          toRelativeCompletionPath(completed, currentPath) ?? completed,
        )
      }
    }
    return true
  }, [searchQuery, setSearchQuery, currentPath, setCurrentPath, expandPath])

  return { handleTabCompletion }
}
