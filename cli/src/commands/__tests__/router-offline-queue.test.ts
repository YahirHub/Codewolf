import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { useChatStore } from '../../state/chat-store'
import { routeUserPrompt } from '../router'

import type { RouterParams } from '../command-registry'

describe('routeUserPrompt offline queue', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  test('queues a normal user prompt while Internet is offline and does not start the provider', async () => {
    const addToQueue = mock(() => {})
    const sendMessage = mock(async () => {})

    const params = {
      abortControllerRef: { current: null },
      agentMode: 'DEFAULT',
      inputRef: { current: null },
      inputValue: 'continúa con la tarea pendiente',
      isChainInProgressRef: { current: false },
      isConnected: false,
      isStreaming: false,
      logoutMutation: {} as RouterParams['logoutMutation'],
      streamMessageIdRef: { current: null },
      addToQueue,
      clearMessages: () => {},
      saveToHistory: () => {},
      scrollToLatest: () => {},
      sendMessage,
      setCanProcessQueue: () => {},
      setInputFocused: () => {},
      setInputValue: () => {},
      setIsAuthenticated: () => {},
      setMessages: () => {},
      setUser: () => {},
      stopStreaming: () => {},
    } satisfies RouterParams

    await routeUserPrompt(params)

    expect(addToQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue).toHaveBeenCalledWith(
      'continúa con la tarea pendiente',
      [],
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
