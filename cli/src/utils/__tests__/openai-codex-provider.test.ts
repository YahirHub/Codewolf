import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  CHATGPT_CODEX_PROVIDER_ID,
  CHATGPT_OAUTH_TOKEN_ENV_VAR,
} from '@codebuff/common/constants/chatgpt-oauth'
import { createOpenAICodexProvider } from '../../providers/openai-codex-catalog'
import {
  getActiveCustomProviderRuntimeConfig,
  loadAvailableProvidersConfig,
  setActiveCustomProvider,
} from '../custom-providers'

describe('ChatGPT/Codex subscription provider', () => {
  let configDir: string
  let previousToken: string | undefined

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-codex-'))
    previousToken = process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR]
    process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR] = 'test-codex-access-token'
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
    if (previousToken === undefined) {
      delete process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR]
    } else {
      process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR] = previousToken
    }
  })

  test('ships the current Codex model catalog', () => {
    const provider = createOpenAICodexProvider()
    const ids = provider.models.map((model) => model.id)

    expect(provider.id).toBe(CHATGPT_CODEX_PROVIDER_ID)
    expect(ids.slice(0, 3)).toEqual([
      'openai/gpt-5.6-sol',
      'openai/gpt-5.6-terra',
      'openai/gpt-5.6-luna',
    ])
    expect(ids).toContain('openai/gpt-5.5')
    expect(ids).toContain('openai/gpt-5.4-mini')
    expect(ids).toContain('openai/gpt-5.3-codex-spark')
  })

  test('appears after login and can be activated without an API key', () => {
    const available = loadAvailableProvidersConfig(configDir)
    expect(
      available.providers.some(
        (provider) => provider.id === CHATGPT_CODEX_PROVIDER_ID,
      ),
    ).toBe(true)

    setActiveCustomProvider(CHATGPT_CODEX_PROVIDER_ID, configDir)
    expect(getActiveCustomProviderRuntimeConfig(configDir)).toMatchObject({
      id: CHATGPT_CODEX_PROVIDER_ID,
      modelId: 'openai/gpt-5.6-sol',
      apiKey: undefined,
    })
  })
})
