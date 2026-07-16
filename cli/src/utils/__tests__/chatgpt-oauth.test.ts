import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  connectChatGptDeviceCode,
  exchangeChatGptCodeForTokens,
  startChatGptOAuthFlow,
} from '../chatgpt-oauth'

describe('chatgpt-oauth utility', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('token exchange error is sanitized and does not include response body', async () => {
    startChatGptOAuthFlow()

    globalThis.fetch = mock(async () => {
      return {
        ok: false,
        status: 401,
        text: async () =>
          'invalid_grant access_token=secret-token refresh_token=secret-refresh',
      } as unknown as Response
    }) as unknown as typeof fetch

    const error = await exchangeChatGptCodeForTokens('auth-code').catch(
      (caught) => caught,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('estado 401')
    expect(error.message).not.toContain('secret-token')
    expect(error.message).not.toContain('secret-refresh')
    expect(error.message).not.toContain('invalid_grant')
  })

  test('completes the device-code flow and exchanges the authorization code', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-device-'))
    const originalHomedir = os.homedir
    ;(os as unknown as { homedir: () => string }).homedir = () => tempHome

    const requests: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      Response.json({
        device_auth_id: 'device-auth-id',
        user_code: 'ABCD-EFGH',
        interval: 0,
      }),
      Response.json({
        authorization_code: 'authorization-code',
        code_verifier: 'device-code-verifier',
      }),
      Response.json({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      }),
    ]

    globalThis.fetch = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init })
        const response = responses.shift()
        if (!response) throw new Error('Unexpected fetch')
        return response
      },
    ) as unknown as typeof fetch

    let shownCode = ''
    let shownUrl = ''

    try {
      const credentials = await connectChatGptDeviceCode({
        onDeviceCode: (info) => {
          shownCode = info.userCode
          shownUrl = info.verificationUrl
        },
      })

      expect(shownCode).toBe('ABCD-EFGH')
      expect(shownUrl).toBe('https://auth.openai.com/codex/device')
      expect(credentials.accessToken).toBe('access-token')
      expect(credentials.refreshToken).toBe('refresh-token')
      expect(requests.map((request) => request.url)).toEqual([
        'https://auth.openai.com/api/accounts/deviceauth/usercode',
        'https://auth.openai.com/api/accounts/deviceauth/token',
        'https://auth.openai.com/oauth/token',
      ])
      expect(new Headers(requests[2]?.init?.headers).get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      )
      expect(String(requests[2]?.init?.body)).toContain(
        'redirect_uri=https%3A%2F%2Fauth.openai.com%2Fdeviceauth%2Fcallback',
      )
    } finally {
      ;(os as unknown as { homedir: () => string }).homedir = originalHomedir
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })
})
