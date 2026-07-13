import { describe, expect, it } from 'bun:test'

import {
  CIRCULAR_JSON_REFERENCE,
  normalizeJsonValue,
  stringifyJsonValue,
} from '../json'

describe('JSON runtime normalization', () => {
  it('replaces ancestor cycles instead of throwing', () => {
    const value: Record<string, unknown> = { name: 'root' }
    value.self = value

    expect(stringifyJsonValue(value)).toBe(
      JSON.stringify({ name: 'root', self: CIRCULAR_JSON_REFERENCE }),
    )
    expect(normalizeJsonValue(value)).toEqual({
      name: 'root',
      self: CIRCULAR_JSON_REFERENCE,
    })
  })

  it('does not treat repeated sibling references as circular', () => {
    const shared = { value: 42 }

    expect(normalizeJsonValue({ first: shared, second: shared })).toEqual({
      first: { value: 42 },
      second: { value: 42 },
    })
  })

  it('preserves bigint information as a decimal string', () => {
    expect(normalizeJsonValue({ count: 9007199254740993n })).toEqual({
      count: '9007199254740993',
    })
  })
})
