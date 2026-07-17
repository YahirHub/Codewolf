import { afterEach, describe, expect, test } from 'bun:test'

import { SecretPromptBridge } from '../secret-prompt-bridge'

import type { SecretPromptRequest } from '@codebuff/common/types/secret-prompt'

function request(id: string): SecretPromptRequest {
  return {
    requestId: id,
    kind: 'ssh-password',
    title: 'SSH password',
    message: 'Enter password',
  }
}

afterEach(() => {
  SecretPromptBridge.resetForTests()
})

describe('SecretPromptBridge', () => {
  test('serializes prompts and returns values only to the local caller', async () => {
    const first = SecretPromptBridge.request(request('first'))
    const second = SecretPromptBridge.request(request('second'))

    expect(SecretPromptBridge.getPendingRequest()?.requestId).toBe('first')
    SecretPromptBridge.respond('first-secret')
    expect(await first).toEqual({ value: 'first-secret' })

    expect(SecretPromptBridge.getPendingRequest()?.requestId).toBe('second')
    SecretPromptBridge.cancel()
    expect(await second).toEqual({ cancelled: true })
    expect(SecretPromptBridge.getPendingRequest()).toBeNull()
  })

  test('cancels a pending prompt when the run is aborted', async () => {
    const controller = new AbortController()
    const pending = SecretPromptBridge.request(request('abort'), controller.signal)
    controller.abort()

    expect(await pending).toEqual({ cancelled: true })
    expect(SecretPromptBridge.getPendingRequest()).toBeNull()
  })
})
