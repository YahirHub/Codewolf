import { useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { useLoginMutation } from '../hooks/use-auth-query'
import { useClipboard } from '../hooks/use-clipboard'
import { useFetchLoginUrl } from '../hooks/use-fetch-login-url'
import { useLoginKeyboardHandlers } from '../hooks/use-login-keyboard-handlers'
import { useLoginPolling } from '../hooks/use-login-polling'
import { useLogo } from '../hooks/use-logo'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTheme } from '../hooks/use-theme'
import { formatUrl, calculateResponsiveLayout } from '../login/utils'
import { useLoginStore } from '../state/login-store'
import { IS_FREEBUFF } from '../utils/constants'
import { copyTextToClipboard, isRemoteSession } from '../utils/clipboard'
import { getFingerprintId } from '../utils/fingerprint'
import { logger } from '../utils/logger'
import { getLogoBlockColor, getLogoAccentColor } from '../utils/theme-system'

import type { User } from '../utils/auth'

interface LoginModalProps {
  onLoginSuccess: (user: User) => void
  hasInvalidCredentials?: boolean | null
}

export const LoginModal = ({
  onLoginSuccess,
  hasInvalidCredentials = false,
}: LoginModalProps) => {
  const renderer = useRenderer()
  const theme = useTheme()

  // Use zustand store for all state
  const {
    loginUrl,
    loading,
    error,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    isWaitingForEnter,
    hasOpenedBrowser,
    sheenPosition,
    justCopied,
    setLoginUrl,
    setLoading,
    setError,
    setFingerprintId,
    setFingerprintHash,
    setExpiresAt,
    setIsWaitingForEnter,
    setHasOpenedBrowser,
    setSheenPosition,
    setCopyMessage,
    setJustCopied,
    setHasClickedLink,
  } = useLoginStore()

  // Track hover state for copy button
  const [isCopyButtonHovered, setIsCopyButtonHovered] = useState(false)

  // Use TanStack Query for login mutation
  const loginMutation = useLoginMutation()

  // Use custom hook for fetching login URL
  const fetchLoginUrlMutation = useFetchLoginUrl({
    setLoginUrl,
    setFingerprintHash,
    setExpiresAt,
    setIsWaitingForEnter,
    setHasOpenedBrowser,
    setError,
  })

  // Copy to clipboard function
  const copyToClipboard = useCallback(
    async (text: string) => {
      if (!text || text.trim().length === 0) return

      setHasClickedLink(true)

      try {
        await copyTextToClipboard(text, {
          suppressGlobalMessage: true,
        })

        setJustCopied(true)
        setCopyMessage('✓ URL copiada al portapapeles')
        setTimeout(() => {
          setCopyMessage(null)
          setJustCopied(false)
        }, 3000)
      } catch (err) {
        // Silently fail - the URL is visible for manual copying
        logger.error(err, 'No se pudo copiar al portapapeles')
      }
    },
    [setHasClickedLink, setJustCopied, setCopyMessage],
  )

  // Fetch login URL and open browser using mutation
  const fetchLoginUrlAndOpenBrowser = useCallback(async () => {
    if (loading || hasOpenedBrowser) return

    setLoading(true)
    setError(null)

    // Near-instant after the prefetch in initializeApp; falls back to the
    // sync legacy fingerprint if hardware hashing fails.
    const id = await getFingerprintId()
    setFingerprintId(id)

    fetchLoginUrlMutation.mutate(id, {
      onSettled: () => {
        setLoading(false)
      },
    })
  }, [
    loading,
    hasOpenedBrowser,
    setLoading,
    setError,
    setFingerprintId,
    fetchLoginUrlMutation,
  ])

  // Store mutation and callback in refs to prevent effect re-runs
  const loginMutationRef = useRef(loginMutation)
  const onLoginSuccessRef = useRef(onLoginSuccess)

  useEffect(() => {
    loginMutationRef.current = loginMutation
  }, [loginMutation])

  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess
  }, [onLoginSuccess])

  // Handle successful login from polling
  const handleLoginSuccess = useCallback((user: User) => {
    loginMutationRef.current.mutate(user, {
      onSuccess: (validatedUser) => {
        onLoginSuccessRef.current(validatedUser)
      },
      onError: (error) => {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          '❌ Falló la validación del inicio de sesión; se continuará con los datos recibidos',
        )
        onLoginSuccessRef.current(user)
      },
    })
  }, [])

  // Handle polling timeout
  const handleTimeout = useCallback(() => {
    setError(
      'El inicio de sesión agotó el tiempo de espera. Inténtalo de nuevo.',
    )
    setIsWaitingForEnter(false)
  }, [setError, setIsWaitingForEnter])

  // Handle polling error
  const handlePollingError = useCallback(
    (pollingError: string) => {
      setError(pollingError)
      setIsWaitingForEnter(false)
    },
    [setError, setIsWaitingForEnter],
  )

  // Use custom hook for login polling
  useLoginPolling({
    loginUrl,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    isWaitingForEnter,
    onSuccess: handleLoginSuccess,
    onTimeout: handleTimeout,
    onError: handlePollingError,
  })

  // Use custom hook for keyboard handlers
  useLoginKeyboardHandlers({
    loginUrl,
    hasOpenedBrowser,
    loading,
    onFetchLoginUrl: fetchLoginUrlAndOpenBrowser,
    onCopyUrl: copyToClipboard,
  })

  // Calculate terminal width and height for responsive display
  const terminalWidth = renderer?.width || 80
  const terminalHeight = renderer?.height || 24

  // Calculate responsive layout
  const {
    isVerySmall,
    isNarrow,
    containerPadding,
    headerMarginTop,
    headerMarginBottom,
    sectionMarginBottom,
    contentMaxWidth,
    maxUrlWidth,
  } = calculateResponsiveLayout(terminalWidth, terminalHeight)

  const loginUrlLines = useMemo(
    () => (loginUrl ? formatUrl(loginUrl, maxUrlWidth) : []),
    [loginUrl, maxUrlWidth],
  )
  // A wrapped URL is a trap: terminal link detection and drag-select only
  // capture the first row, so the auth code arrives truncated.
  const loginUrlWrapped = loginUrlLines.length > 1

  // Use custom hook for sheen animation
  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    accentColor,
    blockColor,
    terminalWidth: renderer?.width,
    sheenPosition,
    setSheenPosition,
  })

  // Get the logo component based on available content width
  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    applySheenToChar,
    textColor: theme.foreground,
  })

  // Enable auto-copy when user selects text (drag to select)
  // hasSelection provides visual feedback when text is being selected
  const { hasSelection } = useClipboard()

  // Format URL for display (wrap if needed)
  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      {/* Sticky banner at top */}
      {hasInvalidCredentials && (
        <box
          style={{
            width: '100%',
            padding: 1,
            backgroundColor: theme.surface,
            flexShrink: 0,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.secondary}>
              {isNarrow
                ? '⚠ Se encontró una API key, pero no es válida. Inicia sesión de nuevo.'
                : '⚠ Se encontró una API key que parece no ser válida. Inicia sesión de nuevo para continuar.'}
            </span>
          </text>
        </box>
      )}

      <box
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: containerPadding,
          gap: 0,
        }}
      >
        {/* Header - Logo rendered by useLogo hook */}
        <box
          key="codebuff-logo"
          style={{
            flexDirection: 'column',
            alignItems: contentMaxWidth < 40 ? 'center' : 'flex-start',
            marginTop: headerMarginTop,
            marginBottom: headerMarginBottom,
            flexShrink: 0,
          }}
        >
          {logoComponent}
        </box>

        {/* Loading state */}
        {loading && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.secondary}>Cargando...</span>
            </text>
          </box>
        )}

        {/* Error state */}
        {error && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg="red">Error: {error}</span>
            </text>
            {!isVerySmall && (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.secondary}>
                  {isNarrow
                    ? 'Inténtalo de nuevo'
                    : 'Reinicia el CLI e inténtalo de nuevo'}
                </span>
              </text>
            )}
          </box>
        )}

        {/* Login instructions - before opening browser */}
        {!loading && !error && !hasOpenedBrowser && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg={'#00cc00'}>Pulsa ENTER para iniciar sesión...</span>
            </text>
          </box>
        )}

        {/* After pressing enter - show URL prominently for all users */}
        {!loading && !error && loginUrl && hasOpenedBrowser && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
              gap: isVerySmall ? 0 : 1,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.foreground}>
                {isNarrow
                  ? 'Abre esta URL para iniciar sesión:'
                  : 'Abre esta URL en el navegador para iniciar sesión:'}
              </span>
            </text>
            <box
              style={{
                width: '100%',
                flexShrink: 0,
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              {loginUrlLines.map((line, index) => (
                <text key={index} style={{ wrapMode: 'none' }}>
                  <span
                    fg={
                      justCopied
                        ? theme.success
                        : hasSelection
                          ? theme.info
                          : theme.primary
                    }
                  >
                    {line}
                  </span>
                </text>
              ))}
            </box>
            {loginUrlWrapped && (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.warning}>
                  ⚠ El enlace ocupa varias líneas; si haces clic se abrirá
                  incompleto. Pulsa c para copiar el enlace completo.
                </span>
              </text>
            )}
            <box
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                flexShrink: 0,
              }}
            >
              <Button
                onClick={() => copyToClipboard(loginUrl)}
                onMouseOver={() => setIsCopyButtonHovered(true)}
                onMouseOut={() => setIsCopyButtonHovered(false)}
              >
                <text>
                  <span
                    fg={
                      justCopied
                        ? theme.foreground
                        : isCopyButtonHovered
                          ? theme.foreground
                          : theme.primary
                    }
                  >
                    {justCopied ? '[ ✓ ¡Copiado! ]' : '[ Copiar enlace (c) ]'}
                  </span>
                </text>
              </Button>
            </box>
            <box
              style={{
                marginTop: isVerySmall ? 1 : 2,
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                flexShrink: 0,
              }}
            >
              <text style={{ wrapMode: 'none' }}>
                <span fg={theme.secondary}>
                  Esperando el inicio de sesión...
                </span>
              </text>
              {isRemoteSession() && !isVerySmall && (
                <text style={{ wrapMode: 'word' }}>
                  <span fg={theme.secondary}>
                    Consejo: si no puedes copiar, sal y ejecuta{' '}
                  </span>
                  <span fg={theme.primary}>
                    {IS_FREEBUFF ? 'freebuff' : 'codewolf'} login
                  </span>
                  <span fg={theme.secondary}> instead.</span>
                </text>
              )}
            </box>
          </box>
        )}
      </box>
    </box>
  )
}
