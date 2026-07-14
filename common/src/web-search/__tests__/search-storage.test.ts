import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  getWebSearchAuthPath,
  getWebSearchSettingsPath,
  loadWebSearchAuth,
  loadWebSearchSettings,
  recordSearchProviderTest,
  removeSearchProviderApiKey,
  saveSearchProviderApiKey,
  setDefaultSearchProvider,
  setSearchFallbackOrder,
  setSearchProviderEnabled,
} from '../search-storage'
import {
  getSearchProviderOrder,
  resolveSearchProviderState,
} from '../search-config'

const tempDirs: string[] = []

function createTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-search-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('web search storage', () => {
  test('keeps metadata and API keys in separate files', () => {
    const configDir = createTempDir()

    saveSearchProviderApiKey('tavily', 'tvly-secret', configDir)

    const settingsText = fs.readFileSync(
      getWebSearchSettingsPath(configDir),
      'utf8',
    )
    const authText = fs.readFileSync(getWebSearchAuthPath(configDir), 'utf8')

    expect(settingsText).not.toContain('tvly-secret')
    expect(authText).toContain('tvly-secret')
    expect(loadWebSearchSettings(configDir).defaultProvider).toBe('tavily')
  })

  test('shows providers without credentials as inactive', () => {
    const configDir = createTempDir()
    const settings = loadWebSearchSettings(configDir)
    const auth = loadWebSearchAuth(configDir)

    expect(resolveSearchProviderState('exa', settings, auth)).toMatchObject({
      configured: false,
      enabled: false,
      disabledReason: 'missing-credential',
    })
    expect(getSearchProviderOrder(settings, auth)).toEqual([])
  })

  test('persists default provider, enabled state, and fallback order', () => {
    const configDir = createTempDir()
    saveSearchProviderApiKey('tavily', 'tavily-key', configDir)
    saveSearchProviderApiKey('exa', 'exa-key', configDir)
    saveSearchProviderApiKey('brave', 'brave-key', configDir)

    setDefaultSearchProvider('exa', configDir)
    setSearchProviderEnabled('brave', false, configDir)
    setSearchFallbackOrder(['exa', 'tavily', 'brave'], configDir)

    const settings = loadWebSearchSettings(configDir)
    const auth = loadWebSearchAuth(configDir)

    expect(settings.defaultProvider).toBe('exa')
    expect(getSearchProviderOrder(settings, auth)).toEqual(['exa', 'tavily'])
    expect(
      resolveSearchProviderState('brave', settings, auth).disabledReason,
    ).toBe('disabled-by-user')
  })

  test('reassigns the default when its key is removed or it is disabled', () => {
    const configDir = createTempDir()
    saveSearchProviderApiKey('tavily', 'tavily-key', configDir)
    saveSearchProviderApiKey('exa', 'exa-key', configDir)
    setSearchFallbackOrder(['tavily', 'exa'], configDir)

    setSearchProviderEnabled('tavily', false, configDir)
    expect(loadWebSearchSettings(configDir).defaultProvider).toBe('exa')

    setSearchProviderEnabled('tavily', true, configDir)
    setDefaultSearchProvider('tavily', configDir)
    removeSearchProviderApiKey('tavily', configDir)

    const settings = loadWebSearchSettings(configDir)
    const auth = loadWebSearchAuth(configDir)
    expect(settings.defaultProvider).toBe('exa')
    expect(getSearchProviderOrder(settings, auth)[0]).toBe('exa')
  })

  test('removing a key makes the provider inactive', () => {
    const configDir = createTempDir()
    saveSearchProviderApiKey('serpapi', 'serp-key', configDir)
    removeSearchProviderApiKey('serpapi', configDir)

    const state = resolveSearchProviderState(
      'serpapi',
      loadWebSearchSettings(configDir),
      loadWebSearchAuth(configDir),
    )

    expect(state.enabled).toBe(false)
    expect(state.configured).toBe(false)
    expect(loadWebSearchAuth(configDir).apiKeys.serpapi).toBeUndefined()
  })
})

describe('search provider test status', () => {
  test('persists the latest connection test without touching credentials', () => {
    const configDir = createTempDir()
    saveSearchProviderApiKey('exa', 'exa-secret', configDir)

    recordSearchProviderTest(
      'exa',
      {
        ok: true,
        message: 'Conexión correcta; 1 resultado.',
        testedAt: '2026-07-13T12:00:00.000Z',
      },
      configDir,
    )

    expect(loadWebSearchSettings(configDir).providers.exa?.lastTest).toEqual({
      ok: true,
      message: 'Conexión correcta; 1 resultado.',
      testedAt: '2026-07-13T12:00:00.000Z',
    })
    expect(loadWebSearchAuth(configDir).apiKeys.exa).toBe('exa-secret')
  })
})
