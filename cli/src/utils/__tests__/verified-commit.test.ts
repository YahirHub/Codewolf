import { describe, expect, test } from 'bun:test'

import {
  __verifiedCommitInternals,
  selectVerifiedCommitPaths,
} from '../verified-commit'

describe('verified commits', () => {
  test('only selects structured mutations that were clean before the turn', () => {
    const result = selectVerifiedCommitPaths({
      projectRoot: '/workspace/project',
      baseline: {
        gitRoot: '/workspace/project',
        dirtyPaths: new Set(['src/already-dirty.ts']),
      },
      mutatedPaths: [
        'src/new.ts',
        'src/already-dirty.ts',
        '../outside.ts',
        'src/new.ts',
      ],
    })

    expect(result).toEqual({
      paths: ['src/new.ts'],
      skippedPreexistingPaths: ['src/already-dirty.ts'],
    })
  })

  test('drops structured paths that no longer have a final Git change', () => {
    const paths = __verifiedCommitInternals.filterPathsByPorcelain(
      ['src/reverted.ts', 'src/changed.ts', 'src/new.ts'],
      ' M src/changed.ts\0?? src/new.ts\0',
    )

    expect(paths).toEqual(['src/changed.ts', 'src/new.ts'])
  })

  test('parses porcelain output including rename records', () => {
    const paths = __verifiedCommitInternals.parsePorcelainZ(
      ' M src/a.ts\0R  src/new.ts\0src/old.ts\0?? contexto/023.md\0',
    )

    expect(paths).toEqual([
      'src/a.ts',
      'src/new.ts',
      'src/old.ts',
      'contexto/023.md',
    ])
  })

  test('sanitizes commit messages and removes forbidden references', () => {
    expect(
      __verifiedCommitInternals.sanitizeSummary(
        'Summary: Agregar contexto persistente. ',
      ),
    ).toBe('Agregar contexto persistente')
    expect(
      __verifiedCommitInternals.sanitizeDescription(
        'Description: Implementado por IA con OpenAI.',
        ['src/a.ts'],
      ),
    ).toBe('Incluye los cambios verificados en 1 archivo: src/a.ts.')
  })
})
