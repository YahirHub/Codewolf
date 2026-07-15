import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  __verifiedCommitInternals,
  captureVerifiedCommitFingerprints,
  createVerifiedCommit,
  selectVerifiedCommitPaths,
} from '../verified-commit'

describe('verified commits', () => {
  const temporaryDirectories: string[] = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

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

  test('allows previously deferred verified paths to remain eligible', () => {
    const result = selectVerifiedCommitPaths({
      projectRoot: '/workspace/project',
      baseline: {
        gitRoot: '/workspace/project',
        dirtyPaths: new Set(['src/deferred.ts', 'src/manual.ts']),
      },
      mutatedPaths: ['src/deferred.ts', 'src/manual.ts', 'src/new.ts'],
      allowedPreexistingPaths: ['src/deferred.ts'],
    })

    expect(result).toEqual({
      paths: ['src/deferred.ts', 'src/new.ts'],
      skippedPreexistingPaths: ['src/manual.ts'],
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

  test('describes context files semantically instead of saving verified changes', () => {
    const message = __verifiedCommitInternals.buildLocalCommitMessage({
      request: 'Crea y actualiza el contexto del proyecto.',
      paths: [
        'contexto/000-contexto-maestro.md',
        'contexto/05-fase1-mejoras-ux-escaneo.md',
        'contexto/06-rediseno-responsive-animaciones.md',
        'knowledge.md',
      ],
      changes: [
        {
          path: 'contexto/000-contexto-maestro.md',
          status: ' M',
          kind: 'modified',
        },
        {
          path: 'contexto/05-fase1-mejoras-ux-escaneo.md',
          status: '??',
          kind: 'untracked',
        },
        {
          path: 'contexto/06-rediseno-responsive-animaciones.md',
          status: '??',
          kind: 'untracked',
        },
        {
          path: 'knowledge.md',
          status: ' M',
          kind: 'modified',
        },
      ],
      markdownTitles: {
        'contexto/05-fase1-mejoras-ux-escaneo.md':
          'Fase 1 mejoras UX de escaneo',
        'contexto/06-rediseno-responsive-animaciones.md':
          'Rediseño responsive y animaciones',
      },
    })

    expect(message.summary).toBe('Crear archivos de contexto del proyecto')
    expect(message.description).toContain(
      'contexto/05-fase1-mejoras-ux-escaneo.md',
    )
    expect(message.description).toContain('Fase 1 mejoras UX de escaneo')
    expect(message.description).toContain('knowledge.md')
    expect(message.description).not.toContain('cambios verificados')
  })

  test('creates a semantic context commit without requiring a provider', async () => {
    const gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-commit-'))
    temporaryDirectories.push(gitRoot)
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', gitRoot, ...args], { encoding: 'utf8' })

    git('init', '-b', 'main')
    git('config', 'user.name', 'Codewolf Test')
    git('config', 'user.email', 'codewolf-test@example.invalid')
    fs.mkdirSync(path.join(gitRoot, 'contexto'))
    fs.writeFileSync(
      path.join(gitRoot, 'contexto/000-contexto-maestro.md'),
      '# Contexto maestro\n',
    )
    fs.writeFileSync(path.join(gitRoot, 'knowledge.md'), '# Memoria\n')
    git('add', '-A')
    git('commit', '-m', 'Inicializar prueba')

    fs.appendFileSync(
      path.join(gitRoot, 'contexto/000-contexto-maestro.md'),
      '\nEstado actualizado.\n',
    )
    fs.writeFileSync(
      path.join(gitRoot, 'contexto/05-fase1-mejoras-ux-escaneo.md'),
      '# 05 — Fase 1 mejoras UX de escaneo\n',
    )
    fs.writeFileSync(
      path.join(gitRoot, 'contexto/06-rediseno-responsive-animaciones.md'),
      '# 06 — Rediseño responsive y animaciones\n',
    )
    fs.appendFileSync(path.join(gitRoot, 'knowledge.md'), '\nMás decisiones.\n')

    const paths = [
      'contexto/000-contexto-maestro.md',
      'contexto/05-fase1-mejoras-ux-escaneo.md',
      'contexto/06-rediseno-responsive-animaciones.md',
      'knowledge.md',
    ]
    const pending = {
      projectRoot: gitRoot,
      gitRoot,
      request: 'Documenta el estado actual del proyecto.',
      paths,
      skippedPreexistingPaths: [],
      fingerprints: captureVerifiedCommitFingerprints({ gitRoot, paths }),
    }

    const result = await createVerifiedCommit({ pending })
    const subject = git('log', '-1', '--pretty=%s').trim()
    const body = git('log', '-1', '--pretty=%b').trim()

    expect(result.summary).toBe('Crear archivos de contexto del proyecto')
    expect(subject).toBe('Crear archivos de contexto del proyecto')
    expect(body).toContain('Fase 1 mejoras UX de escaneo')
    expect(body).toContain('knowledge.md')
    expect(git('status', '--porcelain')).toBe('')
  })

  test('uses the semantic fallback for generic model summaries', () => {
    expect(
      __verifiedCommitInternals.sanitizeSummary(
        'Guardar cambios verificados',
        'Crear archivos de contexto del proyecto',
      ),
    ).toBe('Crear archivos de contexto del proyecto')
  })

  test('uses the semantic fallback for generic model descriptions', () => {
    expect(
      __verifiedCommitInternals.sanitizeDescription(
        'Incluye los cambios verificados en 4 archivos: contexto/000.md, contexto/05.md, contexto/06.md, knowledge.md.',
        ['contexto/000.md'],
        'Crea documentos de contexto y actualiza la memoria del proyecto.',
      ),
    ).toBe('Crea documentos de contexto y actualiza la memoria del proyecto.')
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
