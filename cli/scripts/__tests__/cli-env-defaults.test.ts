import { afterEach, describe, expect, test } from 'bun:test'

import { applyCliEnvironmentDefaults } from '../cli-env-defaults'

const KEYS = [
  'NEXT_PUBLIC_CB_ENVIRONMENT',
  'NEXT_PUBLIC_CODEBUFF_APP_URL',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
  'NEXT_PUBLIC_POSTHOG_API_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST_URL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL',
  'NEXT_PUBLIC_WEB_PORT',
] as const

const originalValues = Object.fromEntries(
  KEYS.map((key) => [key, process.env[key]]),
)

afterEach(() => {
  for (const key of KEYS) {
    const original = originalValues[key]
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }
})

describe('applyCliEnvironmentDefaults', () => {
  test('fills every public value required by the CLI', () => {
    for (const key of KEYS) delete process.env[key]

    applyCliEnvironmentDefaults('dev')

    expect(process.env.NEXT_PUBLIC_CB_ENVIRONMENT).toBe('dev')
    expect(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL).toBe(
      'https://codebuff.com',
    )
    expect(process.env.NEXT_PUBLIC_POSTHOG_API_KEY).toBe('disabled')
    expect(process.env.NEXT_PUBLIC_WEB_PORT).toBe('3000')
  })

  test('does not replace explicit environment configuration', () => {
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT = 'test'
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://example.test'

    applyCliEnvironmentDefaults('prod')

    expect(process.env.NEXT_PUBLIC_CB_ENVIRONMENT).toBe('test')
    expect(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL).toBe(
      'https://example.test',
    )
  })
})
