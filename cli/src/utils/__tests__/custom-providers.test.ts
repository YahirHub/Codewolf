import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  activateCustomProviderModel,
  createCustomProviderId,
  disableCustomProvider,
  discoverCustomProviderModels,
  getActiveCustomProviderRuntimeConfig,
  getCustomProviderAuthPath,
  getCustomProvidersPath,
  loadCustomProvidersConfig,
  normalizeCustomProviderBaseUrl,
  parseCustomProviderModels,
  removeCustomProvider,
  setActiveCustomProvider,
  setActiveCustomProviderModel,
  upsertCustomProvider,
} from '../custom-providers'

describe('custom providers', () => {
  let configDir: string
  const originalEnv = process.env.TEST_CUSTOM_PROVIDER_KEY
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    if (originalEnv === undefined) {
      delete process.env.TEST_CUSTOM_PROVIDER_KEY
    } else {
      process.env.TEST_CUSTOM_PROVIDER_KEY = originalEnv
    }
  })

  test('normalizes API roots and strips chat completions endpoint', () => {
    expect(
      normalizeCustomProviderBaseUrl(
        'https://example.test/v1/chat/completions?ignored=true',
      ),
    ).toBe('https://example.test/v1')
  })

  test('creates a stable provider id from its display name', () => {
    expect(createCustomProviderId('Mi Proveedor Ágil')).toBe('mi-proveedor-agil')
  })

  test('accepts comma-separated and newline-separated model ids', () => {
    expect(parseCustomProviderModels('coder-a, coder-b\ncoder-c')).toEqual([
      { id: 'coder-a' },
      { id: 'coder-b' },
      { id: 'coder-c' },
    ])
  })

  test('stores provider metadata separately from direct API keys', () => {
    upsertCustomProvider({
      id: 'my-provider',
      name: 'My provider',
      baseUrl: 'https://example.test/v1',
      apiKeyInput: 'secret-value',
      models: 'coder-large,coder-small',
      configDir,
    })

    const configText = fs.readFileSync(
      getCustomProvidersPath(configDir),
      'utf8',
    )
    const authText = fs.readFileSync(
      getCustomProviderAuthPath(configDir),
      'utf8',
    )
    const config = loadCustomProvidersConfig(configDir)
    const runtime = getActiveCustomProviderRuntimeConfig(configDir)

    expect(configText).not.toContain('secret-value')
    expect(authText).toContain('secret-value')
    expect(config.activeProviderId).toBe('my-provider')
    expect(config.activeModelId).toBe('coder-large')
    expect(runtime).toMatchObject({
      id: 'my-provider',
      name: 'My provider',
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-value',
      modelId: 'coder-large',
    })
  })

  test('allows providers without authentication', () => {
    upsertCustomProvider({
      name: 'Local API',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKeyInput: '',
      models: 'local-model',
      configDir,
    })

    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: 'local-api',
      apiKey: undefined,
      modelId: 'local-model',
    })
  })

  test('resolves API keys from an environment variable', () => {
    process.env.TEST_CUSTOM_PROVIDER_KEY = 'from-environment'
    upsertCustomProvider({
      id: 'environment-provider',
      name: 'Environment provider',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKeyInput: 'env:TEST_CUSTOM_PROVIDER_KEY',
      models: 'local-model',
      configDir,
    })

    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      apiKey: 'from-environment',
      modelId: 'local-model',
    })
    expect(
      fs.readFileSync(getCustomProviderAuthPath(configDir), 'utf8'),
    ).not.toContain('from-environment')
  })

  test('discovers and normalizes models from the OpenAI /models endpoint', async () => {
    let requestedUrl = ''
    let authorization = ''
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input)
      authorization = new Headers(init?.headers).get('Authorization') ?? ''
      return Response.json({
        data: [
          { id: 'coder-b', name: 'Coder B' },
          { id: 'coder-a' },
          { id: 'coder-b', name: 'Duplicate' },
        ],
      })
    }) as typeof fetch

    await expect(
      discoverCustomProviderModels({
        baseUrl: 'https://example.test/v1/chat/completions',
        apiKey: 'secret',
      }),
    ).resolves.toEqual([
      { id: 'coder-b', name: 'Duplicate' },
      { id: 'coder-a' },
    ])
    expect(requestedUrl).toBe('https://example.test/v1/models')
    expect(authorization).toBe('Bearer secret')
  })

  test('switches providers and models and can return to the Codebuff backend', () => {
    upsertCustomProvider({
      id: 'first',
      name: 'First',
      baseUrl: 'https://first.test/v1',
      apiKeyInput: 'none',
      models: 'one,two',
      configDir,
    })
    upsertCustomProvider({
      id: 'second',
      name: 'Second',
      baseUrl: 'https://second.test/v1',
      apiKeyInput: 'none',
      models: 'other',
      configDir,
    })

    setActiveCustomProvider('first', configDir)
    setActiveCustomProviderModel('two', configDir)
    expect(getActiveCustomProviderRuntimeConfig(configDir)?.modelId).toBe('two')

    activateCustomProviderModel('second', 'other', configDir)
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: 'second',
      modelId: 'other',
    })

    disableCustomProvider(configDir)
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toBeUndefined()
  })

  test('removes credentials together with the provider', () => {
    upsertCustomProvider({
      id: 'temporary',
      name: 'Temporary',
      baseUrl: 'https://temporary.test/v1',
      apiKeyInput: 'remove-me',
      models: 'model',
      configDir,
    })

    expect(removeCustomProvider('temporary', configDir)).toBe(true)
    expect(loadCustomProvidersConfig(configDir).providers).toHaveLength(0)
    expect(
      fs.readFileSync(getCustomProviderAuthPath(configDir), 'utf8'),
    ).not.toContain('remove-me')
  })
})
