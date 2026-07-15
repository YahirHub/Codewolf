import { beforeEach, describe, expect, test } from 'bun:test'

import {
  buildReviewPrompt,
  buildReviewPromptFromArgs,
} from '../prompt-builders'

// Inject the ChatGPT connection state so we can drive both branches of the
// connected/not-connected prompt selection deterministically, without
// mocking the `chatgpt-oauth` module (mock.module() is process-global in
// Bun and leaks into unrelated test files run later in the same process).
let connected = false
const isChatGptConnected = () => connected

describe('prompt-builders ChatGPT-aware base prompts', () => {
  beforeEach(() => {
    connected = false
  })

  describe('when ChatGPT is connected', () => {
    beforeEach(() => {
      connected = true
    })

    test('/review delegates to @thinker-gpt', () => {
      expect(
        buildReviewPrompt('uncommitted', undefined, isChatGptConnected),
      ).toContain('@thinker-gpt')
      expect(
        buildReviewPromptFromArgs('the parser', isChatGptConnected),
      ).toContain('@thinker-gpt')
    })
  })

  describe('when ChatGPT is not connected', () => {
    test('/review runs on the selected model (no @thinker-gpt spawn)', () => {
      expect(
        buildReviewPrompt('uncommitted', undefined, isChatGptConnected),
      ).not.toContain('@thinker-gpt')
      expect(
        buildReviewPromptFromArgs('the parser', isChatGptConnected),
      ).not.toContain('@thinker-gpt')
    })
  })

  test('review input is preserved regardless of connection state', () => {
    connected = true
    expect(
      buildReviewPromptFromArgs('do the thing', isChatGptConnected),
    ).toContain('do the thing')
    connected = false
    expect(
      buildReviewPromptFromArgs('do the thing', isChatGptConnected),
    ).toContain('do the thing')
  })
})
