import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { CHATGPT_CODEX_PROVIDER_ID } from '@codebuff/common/constants/chatgpt-oauth'
import type { ChatGptOAuthCredentials } from '../../credentials'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'

describe('getModelForRequest free-mode guards', () => {
  const mockGetValidChatGptOAuthCredentials = mock(
    async (): Promise<ChatGptOAuthCredentials | null> => null,
  )

  beforeEach(async () => {
    // Mock CHATGPT_OAUTH_ENABLED to true so the ChatGPT OAuth path is entered.
    // Uses mockModule helper since this is an absolute package specifier.
    await mockModule('@codebuff/common/constants/chatgpt-oauth', () => ({
      CHATGPT_OAUTH_ENABLED: true,
    }))

    // Mock credentials directly with Bun's mock.module — the helper resolves
    // relative paths from common/src/testing/, not from this test file.
    mock.module('../../credentials', () => ({
      getValidChatGptOAuthCredentials: mockGetValidChatGptOAuthCredentials,
    }))

    mockGetValidChatGptOAuthCredentials.mockReset()
    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  async function importFresh() {
    const mod = await import('../model-provider')
    // Ensure clean rate-limit state
    mod.resetChatGptOAuthRateLimit()
    return mod
  }

  test('throws when ChatGPT OAuth is rate-limited in free mode', async () => {
    const { getModelForRequest, markChatGptOAuthRateLimited } =
      await importFresh()

    markChatGptOAuthRateLimited()

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'free',
      }),
    ).rejects.toThrow('ChatGPT rate limit reached')
  })

  test('throws when ChatGPT OAuth credentials are unavailable in free mode', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'free',
      }),
    ).rejects.toThrow('ChatGPT OAuth credentials unavailable')
  })

  test('fails explicitly when rate-limited in non-free mode instead of falling back', async () => {
    const { getModelForRequest, markChatGptOAuthRateLimited } =
      await importFresh()

    markChatGptOAuthRateLimited()

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'default',
      }),
    ).rejects.toThrow('ChatGPT rate limit reached')
  })

  test('fails explicitly when credentials are unavailable in non-free mode instead of falling back', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'default',
      }),
    ).rejects.toThrow('ChatGPT OAuth credentials unavailable')
  })

  test('routes the bundled Codex subscription provider through ChatGPT OAuth', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue({
      accessToken: 'subscription-access-token',
      refreshToken: 'subscription-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      connectedAt: Date.now(),
    })

    const result = await getModelForRequest({
      apiKey: 'local-custom-provider:openai-codex',
      model: 'openai/gpt-5.6-sol',
      customProvider: {
        id: CHATGPT_CODEX_PROVIDER_ID,
        name: 'ChatGPT Plus/Pro (Codex Subscription)',
        baseUrl: 'https://chatgpt.com/backend-api',
        modelId: 'openai/gpt-5.6-sol',
        maxContextTokens: 272_000,
        maxOutputTokens: 128_000,
      },
    })

    expect(result.isChatGptOAuth).toBe(true)
    expect(result.isCustomProvider).toBe(false)
  })

  test('does not fall back when the explicit Codex subscription has no session', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    await expect(
      getModelForRequest({
        apiKey: 'local-custom-provider:openai-codex',
        model: 'openai/gpt-5.6-sol',
        customProvider: {
          id: CHATGPT_CODEX_PROVIDER_ID,
          name: 'ChatGPT Plus/Pro (Codex Subscription)',
          baseUrl: 'https://chatgpt.com/backend-api',
          modelId: 'openai/gpt-5.6-sol',
          maxContextTokens: 272_000,
          maxOutputTokens: 128_000,
        },
      }),
    ).rejects.toThrow('Vuelve a iniciar sesión desde /login')
  })
})
