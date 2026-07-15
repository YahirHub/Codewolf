import os from 'os'
import path from 'path'

import { describe, expect, it } from 'bun:test'

import {
  getAllPathsWithDirectories,
  getProjectFileTree,
} from '../project-file-tree'
import { createMockFs } from '../testing/mocks/filesystem'
import { getPathApi } from '../util/path-flavor'

/**
 * Builds a mock fs from relative file paths under `root`, inferring
 * intermediate directories.
 */
function createFsWithFiles(root: string, files: string[]) {
  const pathApi = getPathApi(root)
  const normalizedRoot = pathApi.resolve(root)
  const fileRecords: Record<string, string> = {}
  const dirChildren: Record<string, Set<string>> = {
    [normalizedRoot]: new Set(),
  }
  for (const file of files) {
    fileRecords[pathApi.join(normalizedRoot, file)] = ''
    let child = pathApi.join(normalizedRoot, file)
    let dir = pathApi.dirname(child)
    while (true) {
      ;(dirChildren[dir] ??= new Set()).add(pathApi.basename(child))
      if (dir === normalizedRoot) break
      child = dir
      dir = pathApi.dirname(dir)
    }
  }
  return createMockFs({
    files: fileRecords,
    directories: Object.fromEntries(
      Object.entries(dirChildren).map(([dir, names]) => [dir, [...names]]),
    ),
  })
}

describe('getProjectFileTree', () => {
  it('scans the home directory shallowly instead of returning nothing', async () => {
    const home = os.homedir()
    const fs = createFsWithFiles(home, [
      'top-level.txt',
      'proj/README.md',
      'proj/docs/guide.md',
      'proj/docs/deep/too-deep.md',
      '.hidden/secret.txt',
    ])

    const tree = await getProjectFileTree({ projectRoot: home, fs })
    const paths = getAllPathsWithDirectories(tree).map((p) => p.path)

    // Files up to 3 levels deep are included
    expect(paths).toContain('top-level.txt')
    expect(paths).toContain(path.join('proj', 'README.md'))
    expect(paths).toContain(path.join('proj', 'docs', 'guide.md'))
    // The depth-3 directory shows up as a node, but its contents do not
    expect(paths).toContain(path.join('proj', 'docs', 'deep'))
    expect(paths).not.toContain(
      path.join('proj', 'docs', 'deep', 'too-deep.md'),
    )
    // Dotfiles are still excluded
    expect(paths.some((p) => p.includes('.hidden'))).toBe(false)
  })

  it('scans regular project roots without a depth limit', async () => {
    const root = '/repo'
    const fs = createFsWithFiles(root, ['a/b/c/d/e.txt'])

    const tree = await getProjectFileTree({ projectRoot: root, fs })
    const paths = getAllPathsWithDirectories(tree).map((p) => p.path)

    expect(paths).toContain('a/b/c/d/e.txt')
  })
})
