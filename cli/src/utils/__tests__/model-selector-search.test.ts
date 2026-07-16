import { describe, expect, test } from 'bun:test'

import { filterModelSections } from '../model-selector-search'

const sections = [
  {
    providerId: 'nvidia-nim',
    providerName: 'NVIDIA NIM',
    choices: [
      {
        providerId: 'nvidia-nim',
        providerName: 'NVIDIA NIM',
        modelId: 'deepseek-ai/deepseek-v4-pro',
        modelName: 'DeepSeek V4 Pro',
      },
      {
        providerId: 'nvidia-nim',
        providerName: 'NVIDIA NIM',
        modelId: 'qwen/qwen3.5-397b-a17b',
        modelName: 'Qwen 3.5 397B',
      },
    ],
  },
  {
    providerId: 'suscripcion-codex',
    providerName: 'Suscripción Codex',
    choices: [
      {
        providerId: 'suscripcion-codex',
        providerName: 'Suscripción Codex',
        modelId: 'openai/gpt-5.6-sol',
        modelName: 'GPT-5.6 Sol',
      },
    ],
  },
]

describe('filterModelSections', () => {
  test('busca por proveedor y conserva todos sus modelos', () => {
    const result = filterModelSections(sections, 'nvidia')
    expect(result).toHaveLength(1)
    expect(result[0].choices).toHaveLength(2)
  })

  test('busca por nombre visible e id completo del modelo', () => {
    expect(filterModelSections(sections, 'DeepSeek V4')[0].choices).toHaveLength(
      1,
    )
    expect(filterModelSections(sections, 'qwen3.5-397b')[0].choices[0].modelId).toBe(
      'qwen/qwen3.5-397b-a17b',
    )
  })

  test('combina términos de proveedor y modelo', () => {
    const result = filterModelSections(sections, 'nvidia qwen')
    expect(result).toHaveLength(1)
    expect(result[0].choices.map((choice) => choice.modelName)).toEqual([
      'Qwen 3.5 397B',
    ])
  })

  test('ignora mayúsculas y acentos', () => {
    const result = filterModelSections(sections, 'SUSCRIPCION')
    expect(result).toHaveLength(1)
    expect(result[0].providerId).toBe('suscripcion-codex')
  })

  test('devuelve una lista vacía cuando no hay coincidencias', () => {
    expect(filterModelSections(sections, 'modelo inexistente')).toEqual([])
  })
})
