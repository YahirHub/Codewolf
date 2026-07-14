import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { cyan, green, red, yellow, bold } from 'picocolors'

import { LOGIN_WEBSITE_URL } from './constants'
import { generateLoginUrl, pollLoginStatus } from './login-flow'
import { flushAnalytics, identifyUser, trackEvent } from '../utils/analytics'
import { saveUserCredentials } from '../utils/auth'
import { IS_FREEBUFF } from '../utils/constants'
import { getFingerprintId } from '../utils/fingerprint'
import { logger } from '../utils/logger'

import type { User } from '../utils/auth'

/**
 * Plain-text login flow that runs outside the TUI.
 * Prints the login URL as plain text so the user can select and copy it
 * using normal terminal text selection (Cmd+C / Ctrl+Shift+C).
 *
 * This is the escape hatch for remote/SSH environments where the TUI's
 * clipboard and browser integration don't work.
 */
export async function runPlainLogin(): Promise<void> {
  const fingerprintId = await getFingerprintId()

  console.log()
  console.log(
    bold(
      IS_FREEBUFF
        ? 'Inicio de sesión de Freebuff'
        : 'Inicio de sesión de Codewolf',
    ),
  )
  console.log()
  console.log('Generando URL de inicio de sesión...')

  let loginData
  try {
    loginData = await generateLoginUrl(
      { logger, trackEvent },
      { baseUrl: LOGIN_WEBSITE_URL, fingerprintId, via: 'plain_command' },
    )
  } catch (error) {
    console.error(
      red(
        `No se pudo generar la URL de inicio de sesión: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    )
    process.exit(1)
  }

  console.log()
  console.log('Abre esta URL en el navegador para iniciar sesión:')
  console.log()
  console.log(cyan(loginData.loginUrl))
  console.log()
  console.log(
    yellow(
      'Abre manualmente la URL anterior para completar el inicio de sesión.',
    ),
  )
  console.log()
  console.log('Esperando el inicio de sesión...')

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })

  const result = await pollLoginStatus(
    { sleep, logger, trackEvent },
    {
      baseUrl: LOGIN_WEBSITE_URL,
      fingerprintId,
      fingerprintHash: loginData.fingerprintHash,
      expiresAt: loginData.expiresAt,
      via: 'plain_command',
    },
  )

  if (result.status === 'success') {
    const user = result.user as User
    saveUserCredentials(user)

    // This flow runs outside the TUI and exits immediately, so the React-based
    // login tracking never runs. Identify + track here (tagged `via`) so these
    // logins aren't missing from the funnel, then flush before exiting since
    // process.exit would otherwise drop the buffered PostHog events.
    if (user.id) {
      identifyUser(user.id, { email: user.email, freebuff: IS_FREEBUFF })
      trackEvent(AnalyticsEvent.LOGIN, {
        userId: user.id,
        via: 'plain_command',
        hasEmail: Boolean(user.email),
        hasName: Boolean(user.name),
      })
      await flushAnalytics()
    }

    console.log()
    console.log(green(`✓ Sesión iniciada como ${user.name} (${user.email})`))
    console.log()
    const cliName = IS_FREEBUFF ? 'freebuff' : 'codewolf'
    console.log('Ahora puedes ejecutar ' + cyan(cliName) + ' para iniciar.')
    process.exit(0)
  } else if (result.status === 'timeout') {
    console.error(
      red('El inicio de sesión agotó el tiempo de espera. Inténtalo de nuevo.'),
    )
    process.exit(1)
  } else {
    console.error(red('El inicio de sesión fue cancelado.'))
    process.exit(1)
  }
}
