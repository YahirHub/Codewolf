import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CHATGPT_CODEX_PROVIDER_ID } from '@codebuff/common/constants/chatgpt-oauth'

import {
  activateCustomProviderModel,
  createCustomProviderId,
  disableCustomProvider,
  discoverCustomProviderModels,
  formatCustomProviderModelsInput,
  getActiveCustomProviderCompactionThreshold,
  getActiveProviderModelSnapshot,
  getActiveCustomProviderRuntimeConfig,
  getContextCompactionThreshold,
  getCustomProviderApiKey,
  getCustomProviderAuthPath,
  getCustomProviderAuthStatus,
  getCustomProviderAuthStatuses,
  getCustomProvidersPath,
  loadAvailableProvidersConfig,
  loadCustomProvidersConfig,
  normalizeCustomProviderBaseUrl,
  parseCustomProviderModels,
  removeCustomProvider,
  setActiveCustomProvider,
  setActiveCustomProviderModel,
  updateCustomProvider,
  upsertCustomProvider,
} from '../custom-providers'
import {
  OPENCODE_FREE_BASE_URL,
  OPENCODE_FREE_PROVIDER_ID,
} from '../../providers/opencode-catalog'

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

  test('includes OpenCode Free by default without persisting credentials', () => {
    const available = loadAvailableProvidersConfig(configDir)
    const provider = available.providers.find(
      (item) => item.id === OPENCODE_FREE_PROVIDER_ID,
    )

    expect(provider).toBeDefined()
    expect(provider?.baseUrl).toBe(OPENCODE_FREE_BASE_URL)
    expect(provider?.models.length).toBeGreaterThan(0)
    expect(
      provider?.models.every((model) => model.id.endsWith('-free')),
    ).toBe(true)
    expect(available.activeProviderId).toBe(OPENCODE_FREE_PROVIDER_ID)
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: OPENCODE_FREE_PROVIDER_ID,
      apiKey: undefined,
    })
    expect(fs.existsSync(getCustomProviderAuthPath(configDir))).toBe(false)
    expect(fs.existsSync(getCustomProvidersPath(configDir))).toBe(false)
  })

  test('reports bundled Codex authentication without reading custom provider storage', () => {
    expect(getCustomProviderAuthStatus(CHATGPT_CODEX_PROVIDER_ID, configDir)).toEqual({
      type: 'subscription',
      label: 'Suscripción conectada',
    })
  })

  test('loads authentication statuses for multiple providers in one pass', () => {
    upsertCustomProvider({
      id: 'stored-provider',
      name: 'Stored provider',
      baseUrl: 'https://stored.example.test/v1',
      apiKeyInput: 'stored-secret',
      models: 'model-a',
      configDir,
    })
    upsertCustomProvider({
      id: 'public-provider',
      name: 'Public provider',
      baseUrl: 'https://public.example.test/v1',
      apiKeyInput: 'none',
      models: 'model-b',
      configDir,
    })

    expect(
      getCustomProviderAuthStatuses(
        ['stored-provider', 'public-provider', CHATGPT_CODEX_PROVIDER_ID],
        configDir,
      ),
    ).toEqual({
      'stored-provider': { type: 'stored', label: 'API key guardada' },
      'public-provider': { type: 'none', label: 'Sin autenticación' },
      [CHATGPT_CODEX_PROVIDER_ID]: {
        type: 'subscription',
        label: 'Suscripción conectada',
      },
    })
  })

  test('keeps OpenCode Free ephemeral when selecting one of its models', () => {
    const available = loadAvailableProvidersConfig(configDir)
    const freeModel = available.providers.find(
      (provider) => provider.id === OPENCODE_FREE_PROVIDER_ID,
    )?.models[0]
    expect(freeModel).toBeDefined()

    activateCustomProviderModel(
      OPENCODE_FREE_PROVIDER_ID,
      freeModel!.id,
      configDir,
    )

    const persisted = loadCustomProvidersConfig(configDir)
    expect(persisted.activeProviderId).toBe(OPENCODE_FREE_PROVIDER_ID)
    expect(persisted.providers).toEqual([])
    expect(
      getCustomProviderApiKey(OPENCODE_FREE_PROVIDER_ID, configDir),
    ).toBeUndefined()
    expect(fs.existsSync(getCustomProviderAuthPath(configDir))).toBe(false)
  })

  test('normalizes API roots and strips chat completions endpoint', () => {
    expect(
      normalizeCustomProviderBaseUrl(
        'https://example.test/v1/chat/completions?ignored=true',
      ),
    ).toBe('https://example.test/v1')
  })

  test('creates a stable provider id from its display name', () => {
    expect(createCustomProviderId('Mi Proveedor Ágil')).toBe(
      'mi-proveedor-agil',
    )
  })

  test('accepts comma-separated and newline-separated model ids', () => {
    expect(parseCustomProviderModels('coder-a, coder-b\ncoder-c')).toEqual([
      { id: 'coder-a' },
      { id: 'coder-b' },
      { id: 'coder-c' },
    ])
  })

  test('accepts and formats explicit context windows per model', () => {
    const models = parseCustomProviderModels(
      'deepseek-v4=1_000_000, coder-small=200000',
    )

    expect(models).toEqual([
      { id: 'deepseek-v4', maxContextTokens: 1_000_000 },
      { id: 'coder-small', maxContextTokens: 200_000 },
    ])
    expect(formatCustomProviderModelsInput(models)).toBe(
      'deepseek-v4=1000000, coder-small=200000',
    )
  })

  test('calculates automatic compaction at ninety percent', () => {
    expect(getContextCompactionThreshold(1_000_000)).toBe(900_000)
  })

  test('merges a later explicit context and rejects malformed limits', () => {
    expect(
      parseCustomProviderModels('deepseek-v4, deepseek-v4=1_000_000'),
    ).toEqual([{ id: 'deepseek-v4', maxContextTokens: 1_000_000 }])
    expect(() => parseCustomProviderModels('deepseek-v4=unknown')).toThrow(
      'modelo=tokens',
    )
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
      maxContextTokens: 400_000,
    })
    expect(getActiveCustomProviderCompactionThreshold(configDir)).toBe(360_000)
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
          { id: 'coder-b', name: 'Coder B', context_length: 1_000_000 },
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
      {
        id: 'coder-b',
        name: 'Duplicate',
        maxContextTokens: 1_000_000,
      },
      { id: 'coder-a' },
    ])
    expect(requestedUrl).toBe('https://example.test/v1/models')
    expect(authorization).toBe('Bearer secret')
  })

  test('reads context window metadata from model discovery', async () => {
    globalThis.fetch = (async () =>
      Response.json({
        data: [
          { id: 'large', context_window: '1_000_000' },
          { id: 'small', max_model_len: 131072 },
        ],
      })) as unknown as typeof fetch

    await expect(
      discoverCustomProviderModels({
        baseUrl: 'https://example.test/v1',
      }),
    ).resolves.toEqual([
      { id: 'large', maxContextTokens: 1_000_000 },
      { id: 'small', maxContextTokens: 131_072 },
    ])
  })

  test('uses a one-million-token compatibility default for DeepSeek models', () => {
    upsertCustomProvider({
      id: 'deepseek-provider',
      name: 'DeepSeek provider',
      baseUrl: 'https://example.test/v1',
      apiKeyInput: 'none',
      models: 'deepseek-v4-pro',
      configDir,
    })

    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      maxContextTokens: 1_000_000,
    })
    expect(getActiveCustomProviderCompactionThreshold(configDir)).toBe(900_000)
  })

  test('switches providers and models and can return to an explicit no-provider state', () => {
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
    expect(getActiveProviderModelSnapshot(configDir)).toMatchObject({
      providerId: 'second',
      providerName: 'Second',
      modelId: 'other',
      modelName: 'other',
    })

    disableCustomProvider(configDir)
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toBeUndefined()
    expect(getActiveProviderModelSnapshot(configDir)).toMatchObject({
      providerId: null,
      providerName: 'Sin proveedor',
      modelId: 'none',
      modelName: 'Configura un proveedor con /login',
    })
  })

  test('edits provider metadata and models without exposing or replacing its key', () => {
    upsertCustomProvider({
      id: 'editable',
      name: 'Nombre anterior',
      baseUrl: 'https://old.example.test/v1',
      apiKeyInput: 'stored-secret',
      models: 'model-a,model-b',
      configDir,
    })
    setActiveCustomProviderModel('model-b', configDir)

    const updated = updateCustomProvider({
      id: 'editable',
      name: 'Nombre actualizado',
      baseUrl: 'https://new.example.test/v1/chat/completions',
      models: 'model-b,model-c',
      configDir,
    })

    expect(updated).toMatchObject({
      id: 'editable',
      name: 'Nombre actualizado',
      baseUrl: 'https://new.example.test/v1',
    })
    expect(updated.models).toEqual([{ id: 'model-b' }, { id: 'model-c' }])
    expect(loadCustomProvidersConfig(configDir).activeModelId).toBe('model-b')
    expect(getCustomProviderApiKey('editable', configDir)).toBe('stored-secret')
    expect(getCustomProviderAuthStatus('editable', configDir)).toEqual({
      type: 'stored',
      label: 'API key guardada',
    })
  })

  test('selects the first remaining model and can remove authentication while editing', () => {
    upsertCustomProvider({
      id: 'editable',
      name: 'Editable',
      baseUrl: 'https://example.test/v1',
      apiKeyInput: 'stored-secret',
      models: 'model-a,model-b',
      configDir,
    })
    setActiveCustomProviderModel('model-b', configDir)

    updateCustomProvider({
      id: 'editable',
      name: 'Editable',
      baseUrl: 'https://example.test/v1',
      apiKeyInput: 'none',
      models: 'model-c,model-d',
      configDir,
    })

    const config = loadCustomProvidersConfig(configDir)
    expect(config.activeProviderId).toBe('editable')
    expect(config.activeModelId).toBe('model-c')
    expect(getCustomProviderApiKey('editable', configDir)).toBeUndefined()
    expect(getCustomProviderAuthStatus('editable', configDir)).toEqual({
      type: 'none',
      label: 'Sin autenticación',
    })
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
