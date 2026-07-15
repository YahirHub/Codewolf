import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  NVIDIA_NIM_BASE_URL,
  NVIDIA_NIM_PROVIDER_ID,
  getCuratedNvidiaNimModels,
} from '../../providers/nvidia-nim-catalog'
import {
  configureNvidiaNim,
  refreshNvidiaNimModels,
} from '../nvidia-nim-provider'
import {
  getActiveCustomProviderRuntimeConfig,
  loadCustomProvidersConfig,
} from '../custom-providers'

describe('NVIDIA NIM provider', () => {
  let configDir: string
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-nvidia-nim-'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
  })

  test('ships metadata for current coding and agentic models', () => {
    const ids = getCuratedNvidiaNimModels().map((model) => model.id)

    expect(ids).toContain('deepseek-ai/deepseek-v4-pro')
    expect(ids).toContain('deepseek-ai/deepseek-v4-flash')
    expect(ids).toContain('z-ai/glm-5.2')
    expect(ids).toContain('moonshotai/kimi-k2.6')
    expect(ids).toContain('nvidia/nemotron-4-340b-instruct')
    expect(ids).toContain('nvidia/nemotron-3-ultra-550b-a55b')
    expect(ids).toContain('minimaxai/minimax-m3')
    expect(ids).toContain('mistralai/mistral-medium-3.5-128b')
  })

  test('configures NVIDIA from /models, filters non-chat endpoints, and enables stable transport', async () => {
    let requestedUrl = ''
    let authorization = ''
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input)
      authorization = new Headers(init?.headers).get('Authorization') ?? ''
      return Response.json({
        data: [
          { id: 'nvidia/nemotron-ocr-v2' },
          { id: 'nvidia/nv-embedqa-e5-v5' },
          { id: 'baai/bge-m3' },
          { id: 'nvidia/llama-3.1-nemoguard-8b-topic-control' },
          { id: 'nvidia/nemoretriever-parse' },
          { id: 'nvidia/nemotron-4-340b-reward' },
          { id: 'nvidia/ai-synthetic-video-detector' },
          { id: 'nvidia/nvclip' },
          { id: 'google/deplot' },
          { id: 'provider/new-chat-model', context_length: 131072 },
          { id: 'provider/legacy-chat-8k-instruct' },
          { id: 'provider/unknown-chat-model' },
          { id: 'qwen/qwen3-5-122b-a10b' },
          { id: 'deepseek-ai/deepseek-v4-flash' },
          { id: 'deepseek-ai/deepseek-v4-pro' },
          { id: 'z-ai/glm5.2' },
        ],
      })
    }) as unknown as typeof fetch

    const provider = await configureNvidiaNim({
      apiKey: 'nvapi-secret',
      configDir,
    })

    expect(requestedUrl).toBe(`${NVIDIA_NIM_BASE_URL}/models`)
    expect(authorization).toBe('')
    expect(provider.models.map((model) => model.id)).toEqual([
      'deepseek-ai/deepseek-v4-pro',
      'deepseek-ai/deepseek-v4-flash',
      'z-ai/glm-5.2',
      'qwen/qwen3.5-122b-a10b',
      'provider/legacy-chat-8k-instruct',
      'provider/new-chat-model',
      'provider/unknown-chat-model',
    ])
    const excludedFragments = [
      'ocr',
      'embedqa',
      'bge-m3',
      'nemoguard',
      'retriever',
      'reward',
      'detector',
      'nvclip',
      'deplot',
    ]
    expect(
      provider.models.some((model) =>
        excludedFragments.some((fragment) => model.id.includes(fragment)),
      ),
    ).toBe(false)
    expect(
      provider.models.find(
        (model) => model.id === 'provider/legacy-chat-8k-instruct',
      )?.maxContextTokens,
    ).toBe(8_192)
    expect(
      provider.models.find(
        (model) => model.id === 'provider/unknown-chat-model',
      )?.maxContextTokens,
    ).toBe(32_768)
    expect(loadCustomProvidersConfig(configDir)).toMatchObject({
      activeProviderId: NVIDIA_NIM_PROVIDER_ID,
      activeModelId: 'deepseek-ai/deepseek-v4-pro',
    })
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: NVIDIA_NIM_PROVIDER_ID,
      baseUrl: NVIDIA_NIM_BASE_URL,
      apiKey: 'nvapi-secret',
      modelId: 'deepseek-ai/deepseek-v4-pro',
      maxContextTokens: 1_000_000,
      useNonStreaming: true,
    })
  })

  test('refreshes the configured catalog and removes models no longer returned by NVIDIA', async () => {
    let responseIds = [
      'deepseek-ai/deepseek-v4-pro',
      'deepseek-ai/deepseek-v4-flash',
    ]
    globalThis.fetch = (async () =>
      Response.json({ data: responseIds.map((id) => ({ id })) })) as unknown as typeof fetch

    await configureNvidiaNim({ apiKey: 'nvapi-secret', configDir })
    responseIds = ['deepseek-ai/deepseek-v4-flash', 'z-ai/glm-5.2']
    await refreshNvidiaNimModels({ configDir })

    const provider = loadCustomProvidersConfig(configDir).providers.find(
      (item) => item.id === NVIDIA_NIM_PROVIDER_ID,
    )
    expect(provider?.models.map((model) => model.id)).toEqual([
      'deepseek-ai/deepseek-v4-flash',
      'z-ai/glm-5.2',
    ])
    expect(provider?.useNonStreaming).toBe(true)
  })
})
