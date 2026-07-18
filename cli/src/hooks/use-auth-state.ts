import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { useCallback, useEffect, useState } from 'react'

import { useLogoutMutation } from './use-auth-query'
import { useLoginStore } from '../state/login-store'
import { identifyUser, trackEvent } from '../utils/analytics'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { loggerContext } from '../utils/logger'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { User } from '../utils/auth'

const setAuthLoggerContext = (params: { userId: string; email: string }) => {
  loggerContext.userId = params.userId
  loggerContext.userEmail = params.email
  identifyUser(params.userId, { email: params.email })
}

interface UseAuthStateOptions {
  requireAuth: boolean | null
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setInputFocused: (focused: boolean) => void
  resetChatStore: () => void
}

export const useAuthState = ({
  requireAuth,
  inputRef,
  setInputFocused,
  resetChatStore,
}: UseAuthStateOptions) => {
  const logoutMutation = useLogoutMutation()
  const { resetLoginState } = useLoginStore()

  const initialAuthState = requireAuth === null ? null : !requireAuth
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
    initialAuthState,
  )
  const [user, setUser] = useState<User | null>(null)

  // Update authentication state when requireAuth changes
  useEffect(() => {
    if (requireAuth === null) {
      return
    }
    setIsAuthenticated(!requireAuth)
  }, [requireAuth])


  // Handle successful login
  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      // Identify first (aliases the pre-login anonymous history to the real
      // user id) so the login event below is attributed to the user.
      if (loggedInUser.id && loggedInUser.email) {
        setAuthLoggerContext({
          userId: loggedInUser.id,
          email: loggedInUser.email,
        })
      }

      // Track successful login
      trackEvent(AnalyticsEvent.LOGIN, {
        userId: loggedInUser.id,
        via: 'modal',
        hasEmail: Boolean(loggedInUser.email),
        hasName: Boolean(loggedInUser.name),
      })

      // Reset the SDK client to pick up new credentials
      resetCodebuffClient()
      resetChatStore()
      resetLoginState()
      setInputFocused(true)
      setUser(loggedInUser)
      setIsAuthenticated(true)
    },
    [resetChatStore, resetLoginState, setInputFocused],
  )

  // Auto-focus input after authentication
  useEffect(() => {
    if (isAuthenticated !== true) return

    setInputFocused(true)

    const focusNow = () => {
      const handle = inputRef.current
      if (handle && typeof handle.focus === 'function') {
        handle.focus()
      }
    }

    focusNow()
    const timeoutId = setTimeout(focusNow, 0)

    return () => clearTimeout(timeoutId)
  }, [isAuthenticated, setInputFocused, inputRef])

  return {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser,
    handleLoginSuccess,
    logoutMutation,
  }
}
