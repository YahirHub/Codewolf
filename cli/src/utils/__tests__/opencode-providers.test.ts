import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  OPENCODE_FREE_PROVIDER_ID,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_PROVIDER_ID,
} from '../../providers/opencode-catalog'
import {
  configureOpenCodeGo,
  refreshOpenCodeFreeModels,
} from '../opencode-providers'
import {
  getActiveCustomProviderRuntimeConfig,
  getCustomProviderAuthPath,
  loadAvailableProvidersConfig,
  loadCustomProvidersConfig,
} from '../custom-providers'

describe('bundled OpenCode providers', () => {
  let configDir: string
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-opencode-'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
  })

  test('refreshes OpenCode Free with only models ending in -free and no auth header', async () => {
    let authorization: string | null = null
    globalThis.fetch = (async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization')
      return Response.json({
        data: [
          { id: 'paid-model' },
          { id: 'deepseek-v4-flash-free' },
          { id: 'new-coder-free', context_length: 200000 },
        ],
      })
    }) as unknown as typeof fetch

    const models = await refreshOpenCodeFreeModels({ configDir })

    expect(authorization).toBeNull()
    expect(models.map((model) => model.id)).toEqual([
      'deepseek-v4-flash-free',
      'new-coder-free',
    ])
    expect(
      loadAvailableProvidersConfig(configDir).providers.find(
        (provider) => provider.id === OPENCODE_FREE_PROVIDER_ID,
      )?.models,
    ).toEqual(models)
  })

  test('configures OpenCode Go with its dedicated endpoint and stored API key', async () => {
    let requestedUrl = ''
    let authorization = ''
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input)
      authorization = new Headers(init?.headers).get('Authorization') ?? ''
      return Response.json({
        data: [{ id: 'deepseek-v4-flash' }, { id: 'kimi-k2.6' }],
      })
    }) as unknown as typeof fetch

    await configureOpenCodeGo({ apiKey: 'go-secret', configDir })

    expect(requestedUrl).toBe(`${OPENCODE_GO_BASE_URL}/models`)
    expect(authorization).toBe('Bearer go-secret')
    expect(loadCustomProvidersConfig(configDir)).toMatchObject({
      activeProviderId: OPENCODE_GO_PROVIDER_ID,
      activeModelId: 'deepseek-v4-flash',
    })
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: OPENCODE_GO_PROVIDER_ID,
      baseUrl: OPENCODE_GO_BASE_URL,
      apiKey: 'go-secret',
      modelId: 'deepseek-v4-flash',
    })
    expect(
      fs.readFileSync(getCustomProviderAuthPath(configDir), 'utf8'),
    ).toContain('go-secret')
  })
})
