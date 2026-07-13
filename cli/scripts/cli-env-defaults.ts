/**
 * Safe defaults used by the standalone CLI when no .env file is present.
 *
 * The web application and hosted backend may still provide their own
 * NEXT_PUBLIC_* values. The CLI only fills missing/blank values, so explicit
 * environment configuration always wins.
 */

export type CliEnvironment = 'dev' | 'test' | 'prod'

const SHARED_DEFAULTS = {
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://codebuff.com',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@codebuff.com',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'disabled',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'disabled',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://billing.stripe.com',
  NEXT_PUBLIC_WEB_PORT: '3000',
} as const

export function applyCliEnvironmentDefaults(environment: CliEnvironment): void {
  const defaults: Record<string, string> = {
    NEXT_PUBLIC_CB_ENVIRONMENT: environment,
    ...SHARED_DEFAULTS,
  }

  for (const [key, value] of Object.entries(defaults)) {
    const current = process.env[key]
    if (current === undefined || current.trim() === '') {
      process.env[key] = value
    }
  }
}
