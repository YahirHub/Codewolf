import { describe, expect, test } from 'bun:test'

import {
  detectProjectEcosystems,
  getEcosystemDelegationPrompt,
} from '../detect'
import { getStubProjectFileContext } from '../../util/file'

import type { FileTreeNode } from '../../util/file'

function contextWithFiles(...names: string[]) {
  const context = getStubProjectFileContext()
  context.fileTree = names.map(
    (name): FileTreeNode => ({
      name,
      filePath: name,
      type: 'file',
      lastReadTime: 0,
    }),
  )
  return context
}

describe('automatic ecosystem detection', () => {
  test('detects Python from ordinary user language without registry terms', () => {
    const ecosystems = detectProjectEcosystems({
      fileContext: contextWithFiles(),
      prompt: 'Haz un bot de Telegram en Python que registre usuarios.',
    })

    expect(ecosystems).toContain('pypi')
  })

  test('detects manifests even when the user does not name a language', () => {
    const ecosystems = detectProjectEcosystems({
      fileContext: contextWithFiles('pyproject.toml', 'uv.lock'),
      prompt: 'Agrega una librería mantenida para enviar mensajes.',
    })

    expect(ecosystems).toEqual(['pypi'])
  })

  test('routes supported ecosystems to the isolated researcher', () => {
    const prompt = getEcosystemDelegationPrompt({
      fileContext: contextWithFiles('package.json'),
      prompt: 'Crea un bot con una librería actual.',
    })

    expect(prompt).toContain('ecosystem-researcher')
    expect(prompt).toContain('Do not ask the user which registry')
    expect(prompt).toContain('npm')
  })

  test('routes unsupported structured ecosystems to one focused docs researcher', () => {
    const prompt = getEcosystemDelegationPrompt({
      fileContext: contextWithFiles('Cargo.toml'),
      prompt: 'Crea un bot de Telegram.',
    })

    expect(prompt).toContain('rust')
    expect(prompt).toContain('one focused documentation researcher')
    expect(prompt).toContain('concrete unresolved gap')
  })

  test('detects common manifest variants without technical wording', () => {
    expect(
      detectProjectEcosystems({
        fileContext: contextWithFiles('requirements-dev.txt'),
        prompt: 'Agrega las dependencias necesarias.',
      }),
    ).toEqual(['pypi'])

    expect(
      detectProjectEcosystems({
        fileContext: contextWithFiles('Tasks.Api.csproj'),
        prompt: 'Agrega validación a la API.',
      }),
    ).toEqual(['nuget'])
  })

})
