import { describe, expect, test } from 'bun:test'

import {
  dirnamePath,
  isPathOutsideRoot,
  joinPath,
  relativePath,
  resolvePathFromRoot,
} from '../path-flavor'

describe('cross-platform path flavor', () => {
  test('keeps POSIX virtual paths on Windows hosts', () => {
    expect(resolvePathFromRoot('/repo', 'src/file.ts')).toBe(
      '/repo/src/file.ts',
    )
    expect(joinPath('/home/tester', '.knowledge.md')).toBe(
      '/home/tester/.knowledge.md',
    )
    expect(dirnamePath('/repo/src/file.ts')).toBe('/repo/src')
  })

  test('normalizes Windows paths independently from the host OS', () => {
    expect(resolvePathFromRoot('C:\\repo', 'src/file.ts')).toBe(
      'C:\\repo\\src\\file.ts',
    )
    expect(resolvePathFromRoot('C:\\repo', 'C:/repo/src/file.ts')).toBe(
      'C:\\repo\\src\\file.ts',
    )
    expect(dirnamePath('C:\\repo\\src\\file.ts')).toBe('C:\\repo\\src')
  })

  test('preserves an explicitly absolute path when the root is relative', () => {
    expect(resolvePathFromRoot('.', '/tmp/project/file.ts')).toBe(
      '/tmp/project/file.ts',
    )
    expect(resolvePathFromRoot('.', 'C:\\repo\\file.ts')).toBe(
      'C:\\repo\\file.ts',
    )
  })

  test('does not treat sibling prefixes as descendants', () => {
    expect(isPathOutsideRoot('/repo', '/repo-other/file.ts')).toBe(true)
    expect(relativePath('/repo', '/repo/src/file.ts')).toBe('src/file.ts')
  })

  test('treats absolute paths with another syntax as external', () => {
    expect(relativePath('/repo', 'C:\\repo\\file.ts')).toBeNull()
    expect(isPathOutsideRoot('/repo', 'C:\\repo\\file.ts')).toBe(true)
  })
})
