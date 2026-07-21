import { describe, expect, test } from 'bun:test'

import {
  getProviderManagerRowBounds,
  getProviderManagerScrollTop,
} from '../../utils/provider-manager-scroll'

describe('provider manager scroll', () => {
  const rows = [
    { type: 'provider' as const },
    { type: 'provider' as const },
    { type: 'provider' as const },
    { type: 'add' as const },
    { type: 'close' as const },
  ]

  test('calculates variable row bounds', () => {
    expect(getProviderManagerRowBounds(rows, 0)).toEqual({ top: 0, height: 4 })
    expect(getProviderManagerRowBounds(rows, 2)).toEqual({ top: 8, height: 4 })
    expect(getProviderManagerRowBounds(rows, 3)).toEqual({ top: 12, height: 3 })
    expect(getProviderManagerRowBounds(rows, 4)).toEqual({ top: 15, height: 3 })
  })

  test('scrolls down until the selected row is fully visible', () => {
    const bounds = getProviderManagerRowBounds(rows, 3)
    expect(bounds).not.toBeNull()
    expect(getProviderManagerScrollTop(0, 10, bounds!)).toBe(5)
  })

  test('scrolls up when keyboard navigation returns above the viewport', () => {
    const bounds = getProviderManagerRowBounds(rows, 1)
    expect(bounds).not.toBeNull()
    expect(getProviderManagerScrollTop(9, 10, bounds!)).toBe(4)
  })

  test('keeps the current position while the selected row is visible', () => {
    const bounds = getProviderManagerRowBounds(rows, 2)
    expect(bounds).not.toBeNull()
    expect(getProviderManagerScrollTop(4, 10, bounds!)).toBe(4)
  })
})
