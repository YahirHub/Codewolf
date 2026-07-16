/**
 * ChatGPT/Codex subscription authentication.
 *
 * Supports the localhost browser callback and the headless device-code flow.
 */

import crypto from 'crypto'
import http from 'http'

import {
  CHATGPT_DEVICE_REDIRECT_URI,
  CHATGPT_DEVICE_TOKEN_URL,
  CHATGPT_DEVICE_USER_CODE_URL,
  CHATGPT_DEVICE_VERIFICATION_URL,
  CHATGPT_OAUTH_AUTHORIZE_URL,
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_REDIRECT_URI,
  CHATGPT_OAUTH_TOKEN_URL,
} from '@codebuff/common/constants/chatgpt-oauth'
import {
  clearChatGptOAuthCredentials,
  getChatGptOAuthCredentials,
  isChatGptOAuthValid,
  resetChatGptOAuthRateLimit,
  saveChatGptOAuthCredentials,
} from '@codebuff/sdk'
import { safeOpen } from './open-url'

import type { ChatGptOAuthCredentials } from '@codebuff/sdk'

const CALLBACK_SERVER_TIMEOUT_MS = 5 * 60 * 1000
const DEVICE_CODE_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_DEVICE_POLL_INTERVAL_MS = 5_000

export interface ChatGptDeviceCodeInfo {
  verificationUrl: string
  userCode: string
  expiresInMs: number
  intervalMs: number
}

interface DeviceAuthorizationResponse {
  deviceAuthId: string
  userCode: string
  intervalMs: number
}

function parseOAuthTokenResponse(data: unknown): {
  accessToken: string
  refreshToken: string
  expiresInMs: number
} {
  if (!data || typeof data !== 'object') {
    throw new Error(
      'El formato de la respuesta del token OAuth de ChatGPT no es válido.',
    )
  }

  const tokenData = data as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }

  if (
    typeof tokenData.access_token !== 'string' ||
    tokenData.access_token.trim().length === 0
  ) {
    throw new Error(
      'El intercambio de tokens no devolvió un token de acceso válido.',
    )
  }

  const refreshToken =
    typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : ''
  const expiresInMs =
    typeof tokenData.expires_in === 'number' &&
    Number.isFinite(tokenData.expires_in) &&
    tokenData.expires_in > 0
      ? tokenData.expires_in * 1000
      : 3600 * 1000

  return {
    accessToken: tokenData.access_token,
    refreshToken,
    expiresInMs,
  }
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return toBase64Url(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return toBase64Url(crypto.createHash('sha256').update(verifier).digest())
}

function createAbortError(): Error {
  return new Error('El inicio de sesión de ChatGPT/Codex fue cancelado.')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError()
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      cleanup()
      reject(createAbortError())
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

async function fetchForLogin(
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (init.signal?.aborted) throw createAbortError()
    throw error
  }
}

function persistTokenResponse(
  data: unknown,
  connectedAt = Date.now(),
): ChatGptOAuthCredentials {
  const tokenResponse = parseOAuthTokenResponse(data)
  const credentials: ChatGptOAuthCredentials = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + tokenResponse.expiresInMs,
    connectedAt,
  }

  saveChatGptOAuthCredentials(credentials)
  resetChatGptOAuthRateLimit()
  return credentials
}

async function exchangeAuthorizationCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
  signal?: AbortSignal
}): Promise<ChatGptOAuthCredentials> {
  const response = await fetchForLogin(CHATGPT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    throw new Error(
      `No se pudo intercambiar el código OAuth de ChatGPT (estado ${response.status}). Vuelve a intentarlo desde /login.`,
    )
  }

  return persistTokenResponse(await response.json())
}

let pendingCodeVerifier: string | null = null
let pendingState: string | null = null

export function startChatGptOAuthFlow(): {
  codeVerifier: string
  authUrl: string
} {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = toBase64Url(crypto.randomBytes(16))

  pendingCodeVerifier = codeVerifier
  pendingState = state

  const authUrl = new URL(CHATGPT_OAUTH_AUTHORIZE_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CHATGPT_OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', CHATGPT_OAUTH_REDIRECT_URI)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'openid profile email offline_access')
  authUrl.searchParams.set('id_token_add_organizations', 'true')
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
  authUrl.searchParams.set('originator', 'codex_cli_rs')

  return { codeVerifier, authUrl: authUrl.toString() }
}

let callbackServer: http.Server | null = null

export function stopChatGptOAuthServer(): void {
  if (callbackServer) {
    try {
      callbackServer.close()
    } catch {
      // Ignore a server that was already closed.
    }
    callbackServer = null
  }
  pendingCodeVerifier = null
  pendingState = null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function callbackPageHtml(success: boolean, errorMessage?: string): string {
  const title = success
    ? 'Conectado — Codewolf'
    : 'Falló la conexión — Codewolf'
  const heading = success ? '✓ Conectado con ChatGPT' : 'Falló la conexión'
  const headingColor = success ? '#4ade80' : '#f87171'
  const body = success
    ? 'Puedes cerrar esta pestaña y volver a Codewolf.'
    : `${escapeHtml(errorMessage ?? 'Error desconocido')}. Vuelve a Codewolf e inténtalo nuevamente desde /login.`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5">
<div style="text-align:center;padding:2rem">
<h1 style="color:${headingColor};margin-bottom:0.5rem">${heading}</h1>
<p style="color:#a3a3a3">${body}</p>
</div></body></html>`
}

function startCallbackServer(
  codeVerifier: string,
): Promise<ChatGptOAuthCredentials> {
  const redirectUrl = new URL(CHATGPT_OAUTH_REDIRECT_URI)
  const port = Number.parseInt(redirectUrl.port, 10)
  const callbackPath = redirectUrl.pathname

  return new Promise<ChatGptOAuthCredentials>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopChatGptOAuthServer()
      reject(
        new Error(
          'Se agotó el tiempo de espera de la autorización de ChatGPT.',
        ),
      )
    }, CALLBACK_SERVER_TIMEOUT_MS)

    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('No encontrado')
        return
      }

      const code = reqUrl.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(
          callbackPageHtml(false, 'No se recibió un código de autorización.'),
        )
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(new Error('No hay un código de autorización en el callback.'))
        return
      }

      const state = reqUrl.searchParams.get('state')
      if (pendingState && (!state || state !== pendingState)) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(
          callbackPageHtml(
            false,
            'El estado OAuth no coincide. Inténtalo de nuevo.',
          ),
        )
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(new Error('El estado OAuth no coincide en el callback.'))
        return
      }

      try {
        const credentials = await exchangeAuthorizationCode({
          code,
          codeVerifier,
          redirectUri: CHATGPT_OAUTH_REDIRECT_URI,
        })

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(true))
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        resolve(credentials)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Falló el intercambio del token.'
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(false, message))
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(error instanceof Error ? error : new Error(message))
      }
    })

    server.on('error', (error) => {
      clearTimeout(timeout)
      callbackServer = null
      reject(error)
    })

    server.listen(port, '127.0.0.1', () => {
      callbackServer = server
    })
  })
}

export function connectChatGptOAuth(): {
  authUrl: string
  credentials: Promise<ChatGptOAuthCredentials>
} {
  stopChatGptOAuthServer()

  const { codeVerifier, authUrl } = startChatGptOAuthFlow()
  const credentials = startCallbackServer(codeVerifier)
  void safeOpen(authUrl)

  return { authUrl, credentials }
}

function parseAuthCodeInput(input: string): { code: string; state?: string } {
  const trimmed = input.trim()

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const callback = new URL(trimmed)
    const code = callback.searchParams.get('code')
    const state = callback.searchParams.get('state') ?? undefined
    if (!code) {
      throw new Error(
        'No se encontró un código de autorización en la URL de callback.',
      )
    }
    return { code, state }
  }

  if (trimmed.includes('#')) {
    const [code, state] = trimmed.split('#', 2)
    return { code: code ?? '', state }
  }

  return { code: trimmed }
}

export async function exchangeChatGptCodeForTokens(
  authCodeInput: string,
  codeVerifier?: string,
): Promise<ChatGptOAuthCredentials> {
  const verifier = codeVerifier ?? pendingCodeVerifier
  if (!verifier) {
    throw new Error(
      'No se encontró el verificador PKCE. Reinicia el acceso desde /login.',
    )
  }

  const { code, state } = parseAuthCodeInput(authCodeInput)
  if (!code) throw new Error('El código de autorización está vacío.')
  if (pendingState && state && pendingState !== state) {
    throw new Error(
      'El estado OAuth no coincide. Reinicia el acceso desde /login.',
    )
  }

  const credentials = await exchangeAuthorizationCode({
    code,
    codeVerifier: verifier,
    redirectUri: CHATGPT_OAUTH_REDIRECT_URI,
  })
  pendingCodeVerifier = null
  pendingState = null
  return credentials
}

async function requestDeviceAuthorization(
  signal?: AbortSignal,
): Promise<DeviceAuthorizationResponse> {
  const response = await fetchForLogin(CHATGPT_DEVICE_USER_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CHATGPT_OAUTH_CLIENT_ID }),
    signal,
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'El acceso mediante código de dispositivo no está habilitado para esta cuenta o espacio de trabajo. Usa el acceso con navegador o habilítalo en la configuración de seguridad de ChatGPT.',
      )
    }
    throw new Error(
      `No se pudo solicitar el código de dispositivo de ChatGPT (estado ${response.status}).`,
    )
  }

  const data = (await response.json()) as {
    device_auth_id?: unknown
    user_code?: unknown
    interval?: unknown
  }
  const intervalSeconds =
    typeof data.interval === 'number'
      ? data.interval
      : typeof data.interval === 'string'
        ? Number.parseFloat(data.interval)
        : DEFAULT_DEVICE_POLL_INTERVAL_MS / 1000

  if (
    typeof data.device_auth_id !== 'string' ||
    !data.device_auth_id ||
    typeof data.user_code !== 'string' ||
    !data.user_code ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < 0
  ) {
    throw new Error(
      'ChatGPT devolvió una respuesta de código de dispositivo incompleta.',
    )
  }

  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    intervalMs: Math.max(1_000, intervalSeconds * 1000),
  }
}

function parseDeviceErrorCode(responseBody: string): string | undefined {
  try {
    const data = JSON.parse(responseBody) as {
      error?: string | { code?: unknown }
    }
    if (typeof data.error === 'string') return data.error
    if (
      data.error &&
      typeof data.error === 'object' &&
      typeof data.error.code === 'string'
    ) {
      return data.error.code
    }
  } catch {
    // The body is intentionally not surfaced because it may contain secrets.
  }
  return undefined
}

export async function connectChatGptDeviceCode(params: {
  onDeviceCode: (info: ChatGptDeviceCodeInfo) => void
  signal?: AbortSignal
}): Promise<ChatGptOAuthCredentials> {
  throwIfAborted(params.signal)
  const device = await requestDeviceAuthorization(params.signal)
  params.onDeviceCode({
    verificationUrl: CHATGPT_DEVICE_VERIFICATION_URL,
    userCode: device.userCode,
    expiresInMs: DEVICE_CODE_TIMEOUT_MS,
    intervalMs: device.intervalMs,
  })

  const deadline = Date.now() + DEVICE_CODE_TIMEOUT_MS
  let intervalMs = device.intervalMs

  while (Date.now() < deadline) {
    await delay(intervalMs, params.signal)
    const response = await fetchForLogin(CHATGPT_DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_auth_id: device.deviceAuthId,
        user_code: device.userCode,
      }),
      signal: params.signal,
    })

    if (response.ok) {
      const data = (await response.json()) as {
        authorization_code?: unknown
        code_verifier?: unknown
      }
      if (
        typeof data.authorization_code !== 'string' ||
        !data.authorization_code ||
        typeof data.code_verifier !== 'string' ||
        !data.code_verifier
      ) {
        throw new Error(
          'ChatGPT autorizó el dispositivo, pero no devolvió credenciales completas.',
        )
      }
      return exchangeAuthorizationCode({
        code: data.authorization_code,
        codeVerifier: data.code_verifier,
        redirectUri: CHATGPT_DEVICE_REDIRECT_URI,
        signal: params.signal,
      })
    }

    if (response.status === 403 || response.status === 404) continue

    const errorCode = parseDeviceErrorCode(await response.text())
    if (errorCode === 'deviceauth_authorization_pending') continue
    if (errorCode === 'slow_down') {
      intervalMs += 5_000
      continue
    }

    throw new Error(
      `Falló la autorización del dispositivo de ChatGPT (estado ${response.status}).`,
    )
  }

  throw new Error(
    'El código de dispositivo de ChatGPT venció. Genera uno nuevo desde /login.',
  )
}

export function disconnectChatGptOAuth(): void {
  stopChatGptOAuthServer()
  clearChatGptOAuthCredentials()
  resetChatGptOAuthRateLimit()
}

export function getChatGptOAuthStatus(): {
  connected: boolean
  expiresAt?: number
  connectedAt?: number
} {
  const credentials = getChatGptOAuthCredentials()
  if (!credentials || !isChatGptOAuthValid()) return { connected: false }

  return {
    connected: true,
    expiresAt: credentials.expiresAt,
    connectedAt: credentials.connectedAt,
  }
}
