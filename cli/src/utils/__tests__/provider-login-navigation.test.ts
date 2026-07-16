import { describe, expect, test } from 'bun:test'

import { shouldReturnToPreviousProviderStep } from '../../components/provider-login-screen'

describe('provider login step navigation', () => {
  test('returns to the previous step only from an empty field at cursor zero', () => {
    expect(
      shouldReturnToPreviousProviderStep({
        key: {
          name: 'backspace',
          ctrl: false,
          meta: false,
          option: false,
        },
        currentValue: '',
        cursorPosition: 0,
        stepIndex: 1,
      }),
    ).toBe(true)

    expect(
      shouldReturnToPreviousProviderStep({
        key: {
          name: 'backspace',
          ctrl: false,
          meta: false,
          option: false,
        },
        currentValue: 'h',
        cursorPosition: 1,
        stepIndex: 1,
      }),
    ).toBe(false)
  })

  test('does not navigate from the first step or modified backspace shortcuts', () => {
    expect(
      shouldReturnToPreviousProviderStep({
        key: {
          name: 'backspace',
          ctrl: false,
          meta: false,
          option: false,
        },
        currentValue: '',
        cursorPosition: 0,
        stepIndex: 0,
      }),
    ).toBe(false)

    expect(
      shouldReturnToPreviousProviderStep({
        key: {
          name: 'backspace',
          ctrl: true,
          meta: false,
          option: false,
        },
        currentValue: '',
        cursorPosition: 0,
        stepIndex: 2,
      }),
    ).toBe(false)
  })
})
