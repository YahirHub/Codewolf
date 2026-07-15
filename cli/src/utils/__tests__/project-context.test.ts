import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  __projectContextInternals,
  discoverProjectContext,
} from '../project-context'

const temporaryDirectories: string[] = []

function createTemporaryProject(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-context-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('persistent project context', () => {
  test('discovers markdown files in numeric order and computes the next prefix', () => {
    const projectRoot = createTemporaryProject()
    const contextDir = path.join(projectRoot, 'contexto')
    fs.mkdirSync(contextDir)
    fs.writeFileSync(path.join(contextDir, '010-api.md'), '# API')
    fs.writeFileSync(path.join(contextDir, '002-base.md'), '# Base')
    fs.writeFileSync(path.join(contextDir, 'notes.txt'), 'ignored')

    const discovery = discoverProjectContext(projectRoot)

    expect(discovery).not.toBeNull()
    expect(discovery?.files.map((file) => file.relativePath)).toEqual([
      'contexto/002-base.md',
      'contexto/010-api.md',
    ])
    expect(discovery?.nextNumber).toBe(11)
    expect(discovery?.truncated).toBe(false)
  })

  test('uses every filename when choosing the next prefix even after the read limit', () => {
    const projectRoot = createTemporaryProject()
    const contextDir = path.join(projectRoot, 'contexto')
    fs.mkdirSync(contextDir)
    for (let index = 0; index < 200; index += 1) {
      fs.writeFileSync(
        path.join(contextDir, `${String(index).padStart(3, '0')}-entry.md`),
        `# ${index}`,
      )
    }
    fs.writeFileSync(path.join(contextDir, '999-latest.md'), '# Latest')

    const discovery = discoverProjectContext(projectRoot)

    expect(discovery?.files).toHaveLength(200)
    expect(discovery?.files[0]?.relativePath).toBe('contexto/000-entry.md')
    expect(discovery?.files.at(-1)?.relativePath).toBe('contexto/999-latest.md')
    expect(discovery?.nextNumber).toBe(1000)
    expect(discovery?.truncated).toBe(true)
  })

  test('prioritizes the master file and newest records when the byte limit is reached', () => {
    const projectRoot = createTemporaryProject()
    const contextDir = path.join(projectRoot, 'contexto')
    fs.mkdirSync(contextDir)
    fs.writeFileSync(
      path.join(contextDir, '000-contexto-maestro.md'),
      '# Maestro\nReglas globales',
    )
    for (let index = 1; index <= 6; index += 1) {
      fs.writeFileSync(
        path.join(contextDir, `${String(index).padStart(3, '0')}-cambio.md`),
        `${index}`.repeat(80_000),
      )
    }

    const discovery = discoverProjectContext(projectRoot)
    const selected = discovery?.files.map((file) => file.relativePath) ?? []

    expect(selected).toContain('contexto/000-contexto-maestro.md')
    expect(selected).toContain('contexto/006-cambio.md')
    expect(selected).not.toContain('contexto/001-cambio.md')
    expect(discovery?.truncated).toBe(true)
  })

  test('renders initialization guidance for an empty contexto directory', () => {
    const projectRoot = createTemporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'contexto'))
    const discovery = discoverProjectContext(projectRoot)

    const rendered = __projectContextInternals.renderContextKnowledge(
      null,
      discovery,
    )

    expect(rendered).toContain('todavía no tiene documentos Markdown')
    expect(rendered).toContain('000-contexto-maestro.md')
  })

  test('returns null when contexto does not exist', () => {
    expect(discoverProjectContext(createTemporaryProject())).toBeNull()
  })

  test('renders instructions to create the initial persistent context', () => {
    const rendered = __projectContextInternals.renderContextKnowledge(
      null,
      null,
    )

    expect(rendered).toContain('contexto/000-contexto-maestro.md')
    expect(rendered).toContain('cambio importante')
  })
})
