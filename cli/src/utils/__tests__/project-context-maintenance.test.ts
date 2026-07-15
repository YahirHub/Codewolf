import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  ensureInitialProjectContext,
  maintainProjectContext,
} from '../project-context-maintenance'

import type { CodebuffClient, RunState } from '@codebuff/sdk'

const temporaryDirectories: string[] = []

function temporaryProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-context-write-'))
  temporaryDirectories.push(root)
  return root
}

const runState: RunState = {
  traceSessionId: 'context-test',
  output: {
    type: 'lastMessage',
    value: [{ role: 'assistant', content: 'Se completó el cambio.' }],
  },
}

const client = {
  run: async () => ({
    traceSessionId: 'writer-test',
    output: {
      type: 'structuredOutput' as const,
      value: {
        title: 'Actualizar módulo de prueba',
        objective: 'Documentar el cambio realizado.',
        decisions: ['Conservar la estructura existente.'],
        architecture: ['Se actualiza src/example.ts.'],
        libraries: [],
        problems: [],
        solutions: ['Se implementó el comportamiento solicitado.'],
        pending: ['Ejecutar las pruebas del proyecto.'],
        nextSteps: ['Validar el resultado.'],
        masterSummary: 'El módulo de prueba quedó actualizado.',
      },
    },
  }),
} as unknown as CodebuffClient

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('automatic project context maintenance', () => {
  test('creates a numbered record and updates the master after a code change', async () => {
    const projectRoot = temporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src/example.ts'), 'export {}')

    const result = await maintainProjectContext({
      projectRoot,
      client,
      request: 'Actualiza el módulo de prueba.',
      changedPaths: ['src/example.ts'],
      runState,
    })

    expect(result.paths).toContain('contexto/000-contexto-maestro.md')
    expect(result.paths.some((entry) => /^contexto\/001-/.test(entry))).toBe(
      true,
    )
    expect(
      fs.readFileSync(
        path.join(projectRoot, 'contexto/000-contexto-maestro.md'),
        'utf8',
      ),
    ).toContain('Estado automático más reciente')
  })

  test('/init creates the master and a numbered initialization record', async () => {
    const projectRoot = temporaryProject()
    const initialized = await ensureInitialProjectContext({ projectRoot })

    const result = await maintainProjectContext({
      projectRoot,
      client,
      request: '/init',
      changedPaths: initialized,
      runState,
      forceInit: true,
    })

    expect(fs.existsSync(path.join(projectRoot, 'contexto'))).toBe(true)
    expect(result.paths).toContain('contexto/000-contexto-maestro.md')
    expect(result.paths.some((entry) => /^contexto\/001-/.test(entry))).toBe(
      true,
    )
  })
})
