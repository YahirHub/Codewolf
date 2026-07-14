/**
 * Formats a timeout value for display.
 * - Returns "no timeout" for non-finite values (NaN, Infinity, -Infinity)
 * - Returns "no timeout" for negative values (including -1)
 * - Returns hours (e.g., "1h timeout") for values >= 3600 that are evenly divisible by 3600
 * - Returns minutes (e.g., "2m timeout") for values >= 60 that are evenly divisible by 60
 * - Returns seconds (e.g., "90s timeout") otherwise
 * - Rounds floating point values to nearest integer
 */
export function formatTimeout(timeoutSeconds: number): string {
  // Handle NaN, Infinity, -Infinity
  if (!Number.isFinite(timeoutSeconds)) {
    return 'sin límite de tiempo'
  }
  // Handle all negative values (including -1)
  if (timeoutSeconds < 0) {
    return 'sin límite de tiempo'
  }
  // Round floating point values
  const rounded = Math.round(timeoutSeconds)
  if (rounded >= 3600 && rounded % 3600 === 0) {
    return `${rounded / 3600} h de límite`
  }
  if (rounded >= 60 && rounded % 60 === 0) {
    return `${rounded / 60} min de límite`
  }
  return `${rounded} s de límite`
}
