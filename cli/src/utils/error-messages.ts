import { sanitizeErrorMessage, getErrorStatusCode } from '@codebuff/sdk'

/**
 * Formats an unknown error into a user-facing markdown string.
 *
 * The goal is to provide clear, consistent messaging across the CLI.
 */
export function formatErrorForDisplay(
  error: unknown,
  fallbackTitle: string,
): string {
  const statusCode = getErrorStatusCode(error)

  // Authentication-specific messaging based on statusCode
  if (statusCode === 401) {
    return `${fallbackTitle}: Falló la autenticación. Revisa tu API key.`
  }
  if (statusCode === 403) {
    return `${fallbackTitle}: Acceso prohibido. No tienes permiso para acceder a este recurso.`
  }

  // Network/server error messaging based on statusCode
  if (statusCode !== undefined) {
    if (statusCode === 408) {
      return `${fallbackTitle}: La solicitud agotó el tiempo de espera. Revisa tu conexión a internet.`
    }
    if (statusCode === 503) {
      return `${fallbackTitle}: Servicio no disponible. Es posible que el servidor esté caído.`
    }
    if (statusCode >= 500) {
      return `${fallbackTitle}: Error del servidor. Inténtalo más tarde.`
    }
    if (statusCode === 429) {
      return `${fallbackTitle}: Límite de solicitudes alcanzado. Inténtalo más tarde.`
    }
  }

  // Generic Error instance
  if (error instanceof Error) {
    const message = error.message || 'Ocurrió un error inesperado.'
    return `${fallbackTitle}: ${message}`
  }

  // Try sanitizeErrorMessage for other cases
  const safeMessage = sanitizeErrorMessage(error)
  return `${fallbackTitle}: ${safeMessage}`
}

/**
 * Formats a retry banner message for offline / retry scenarios.
 *
 * Example output:
 *   "⚠️ Network error: Server error. Please try again later. • 3 messages will retry when connection is restored"
 */
export function formatRetryBannerMessage(
  error: unknown,
  pendingCount: number,
): string {
  const baseTitle = 'Error de red'
  const formatted = formatErrorForDisplay(error, baseTitle)

  const suffix =
    pendingCount > 0
      ? ` • ${pendingCount} mensaje${pendingCount === 1 ? '' : 's'} se reintentará${pendingCount === 1 ? '' : 'n'} cuando se restablezca la conexión`
      : ''

  return `⚠️ ${formatted}${suffix}`
}
