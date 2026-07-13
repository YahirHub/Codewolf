import type { JSONValue } from '../types/json'

/**
 * Placeholder used when a runtime object contains a reference to one of its
 * ancestors. JSON cannot represent object references, so the circular branch
 * is replaced with a stable string instead of aborting the whole request.
 */
export const CIRCULAR_JSON_REFERENCE = '[Circular]'

/**
 * JSON.stringify replacer that only treats actual ancestor references as
 * circular. Reusing the same object in two independent branches is preserved
 * by serializing it twice, matching normal JSON value semantics.
 */
function createCircularReferenceReplacer(): (
  this: unknown,
  key: string,
  value: unknown,
) => unknown {
  const ancestors: object[] = []

  return function circularReferenceReplacer(
    this: unknown,
    _key: string,
    value: unknown,
  ): unknown {
    // JSON has no bigint type. Tool integrations occasionally return bigint
    // values, so preserve their information as decimal strings.
    if (typeof value === 'bigint') {
      return value.toString()
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    // Move the ancestor stack back to the current parent. This distinguishes
    // a true cycle from a harmless repeated reference in a sibling branch.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop()
    }

    if (ancestors.includes(value)) {
      return CIRCULAR_JSON_REFERENCE
    }

    ancestors.push(value)
    return value
  }
}

/**
 * Serialize an arbitrary runtime value into valid JSON without throwing for
 * circular references or bigint values.
 */
export function stringifyJsonValue(
  value: unknown,
  space?: number | string,
): string {
  return (
    JSON.stringify(value, createCircularReferenceReplacer(), space) ?? 'null'
  )
}

/**
 * Clone an arbitrary runtime value into plain JSON data. This is the preferred
 * boundary for tool inputs/results before they are persisted or sent to an
 * OpenAI-compatible provider.
 */
export function normalizeJsonValue(value: unknown): JSONValue {
  return JSON.parse(stringifyJsonValue(value)) as JSONValue
}
