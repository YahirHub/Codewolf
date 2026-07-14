import { describe, expect, test } from 'bun:test'

import { formatTimeout } from '../format-timeout'

describe('formatTimeout', () => {
  describe('normal values', () => {
    test('returns seconds for values less than 60', () => {
      expect(formatTimeout(10)).toBe('10 s de límite')
      expect(formatTimeout(30)).toBe('30 s de límite')
      expect(formatTimeout(45)).toBe('45 s de límite')
    })

    test('returns minutes for values evenly divisible by 60', () => {
      expect(formatTimeout(60)).toBe('1 min de límite')
      expect(formatTimeout(120)).toBe('2 min de límite')
      expect(formatTimeout(300)).toBe('5 min de límite')
    })

    test('returns hours for values evenly divisible by 3600', () => {
      expect(formatTimeout(3600)).toBe('1 h de límite')
      expect(formatTimeout(7200)).toBe('2 h de límite')
      expect(formatTimeout(10800)).toBe('3 h de límite')
    })

    test('returns minutes for large values divisible by 60 but not 3600', () => {
      expect(formatTimeout(5400)).toBe('90 min de límite')
    })

    test('returns seconds for large values not evenly divisible by 60', () => {
      expect(formatTimeout(3700)).toBe('3700 s de límite')
    })

    test('returns seconds for values >= 60 not evenly divisible by 60', () => {
      expect(formatTimeout(90)).toBe('90 s de límite')
      expect(formatTimeout(150)).toBe('150 s de límite')
    })

    test('returns "0s timeout" for 0', () => {
      expect(formatTimeout(0)).toBe('0 s de límite')
    })
  })

  describe('negative values', () => {
    test('returns "no timeout" for -1', () => {
      expect(formatTimeout(-1)).toBe('sin límite de tiempo')
    })

    test('returns "no timeout" for other negative values', () => {
      expect(formatTimeout(-5)).toBe('sin límite de tiempo')
      expect(formatTimeout(-100)).toBe('sin límite de tiempo')
      expect(formatTimeout(-0.5)).toBe('sin límite de tiempo')
    })
  })

  describe('non-finite values', () => {
    test('returns "no timeout" for NaN', () => {
      expect(formatTimeout(NaN)).toBe('sin límite de tiempo')
    })

    test('returns "no timeout" for Infinity', () => {
      expect(formatTimeout(Infinity)).toBe('sin límite de tiempo')
    })

    test('returns "no timeout" for -Infinity', () => {
      expect(formatTimeout(-Infinity)).toBe('sin límite de tiempo')
    })
  })

  describe('floating point values', () => {
    test('rounds floating point values to nearest integer', () => {
      expect(formatTimeout(30.4)).toBe('30 s de límite')
      expect(formatTimeout(30.5)).toBe('31 s de límite')
      expect(formatTimeout(30.9)).toBe('31 s de límite')
    })

    test('rounds floating point values for minute display', () => {
      expect(formatTimeout(59.5)).toBe('1 min de límite')
      expect(formatTimeout(60.4)).toBe('1 min de límite')
      expect(formatTimeout(119.6)).toBe('2 min de límite')
    })

    test('handles floating point values that round to non-minute values', () => {
      expect(formatTimeout(60.6)).toBe('61 s de límite')
      expect(formatTimeout(89.5)).toBe('90 s de límite')
    })
  })
})
