import { SUBSCRIPTION_TIERS } from '@codebuff/common/constants/subscription-plans'
import { IS_FREEBUFF } from '../utils/constants'
import { safeOpen } from '../utils/open-url'
import React from 'react'

import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import { useUpdatePreference } from '../hooks/use-update-preference'
import { useUsageQuery } from '../hooks/use-usage-query'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { formatResetTime } from '../utils/time-format'
import { BORDER_CHARS } from '../utils/ui-constants'

export const SubscriptionLimitBanner = () => {
  if (IS_FREEBUFF) return null

  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()

  const { data: subscriptionData } = useSubscriptionQuery({
    refetchInterval: 15 * 1000,
  })

  const { data: usageData } = useUsageQuery({
    enabled: true,
    refetchInterval: 30 * 1000,
  })

  const rateLimit = subscriptionData?.hasSubscription
    ? subscriptionData.rateLimit
    : undefined
  const remainingBalance = usageData?.remainingBalance ?? 0
  const hasAlaCarteCredits = remainingBalance > 0

  // Determine if user can upgrade (not on highest tier)
  const maxTier = Math.max(...Object.keys(SUBSCRIPTION_TIERS).map(Number))
  const currentTier = subscriptionData?.hasSubscription
    ? subscriptionData.subscription.tier
    : 0
  const canUpgrade = currentTier < maxTier

  const fallbackToALaCarte = subscriptionData?.fallbackToALaCarte ?? false
  const updatePreference = useUpdatePreference()

  const handleToggleFallbackToALaCarte = () => {
    updatePreference.mutate({ fallbackToALaCarte: !fallbackToALaCarte })
  }

  if (!subscriptionData || !rateLimit?.limited) {
    return null
  }

  const {
    reason,
    weeklyPercentUsed,
    weeklyResetsAt: weeklyResetsAtStr,
    blockResetsAt: blockResetsAtStr,
  } = rateLimit
  const isWeeklyLimit = reason === 'weekly_limit'
  const isBlockExhausted = reason === 'block_exhausted'
  const weeklyRemaining = 100 - weeklyPercentUsed
  const weeklyResetsAt = weeklyResetsAtStr ? new Date(weeklyResetsAtStr) : null
  const blockResetsAt = blockResetsAtStr ? new Date(blockResetsAtStr) : null

  const handleContinueWithCredits = () => {
    setInputMode('default')
  }

  const handleBuyCredits = () => {
    safeOpen(WEBSITE_URL + '/usage')
  }

  const handleUpgrade = () => {
    safeOpen(WEBSITE_URL + '/subscribe')
  }

  const borderColor = isWeeklyLimit ? theme.error : theme.warning

  return (
    <box
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 3,
          gap: 0,
        }}
      >
        {isWeeklyLimit ? (
          <>
            <text style={{ fg: theme.error, marginBottom: 1 }}>
              🛑 Límite semanal alcanzado
            </text>
            <text style={{ fg: theme.muted }}>
              Usaste los {rateLimit.weeklyLimit.toLocaleString()} créditos
              disponibles para esta semana.
            </text>
            {weeklyResetsAt && (
              <text style={{ fg: theme.muted }}>
                El uso semanal se restablece en{' '}
                {formatResetTime(weeklyResetsAt)}
              </text>
            )}
          </>
        ) : isBlockExhausted ? (
          <>
            <text style={{ fg: theme.warning, marginBottom: 1 }}>
              Límite de 5 horas alcanzado
            </text>
            {blockResetsAt && (
              <text style={{ fg: theme.muted }}>
                La nueva sesión comienza en {formatResetTime(blockResetsAt)}
              </text>
            )}
          </>
        ) : (
          <text style={{ fg: theme.warning }}>
            Límite de suscripción alcanzado
          </text>
        )}

        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 1,
            marginTop: 0,
          }}
        >
          <text style={{ fg: theme.muted }}>Semanal:</text>
          <ProgressBar
            value={weeklyRemaining}
            width={12}
            showPercentage={false}
          />
          <text style={{ fg: theme.muted }}>{weeklyPercentUsed}% usado</text>
        </box>

        {hasAlaCarteCredits ? (
          <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
            {fallbackToALaCarte ? (
              <>
                <text style={{ fg: theme.muted }}>
                  ✓ El uso de créditos está activado. Puedes continuar usando
                  tus créditos.
                </text>
                <box style={{ flexDirection: 'row', gap: 2 }}>
                  <Button onClick={handleContinueWithCredits}>
                    <text
                      style={{ fg: theme.background, bg: theme.foreground }}
                    >
                      {' '}
                      Continuar con créditos (
                      {remainingBalance.toLocaleString()}){' '}
                    </text>
                  </Button>
                  {canUpgrade ? (
                    <Button onClick={handleUpgrade}>
                      <text
                        style={{ fg: theme.background, bg: theme.foreground }}
                      >
                        {' '}
                        Mejorar plan ↗{' '}
                      </text>
                    </Button>
                  ) : (
                    <Button onClick={handleBuyCredits}>
                      <text style={{ fg: theme.background, bg: theme.muted }}>
                        {' '}
                        Comprar créditos ↗{' '}
                      </text>
                    </Button>
                  )}
                </box>
                <Button
                  onClick={handleToggleFallbackToALaCarte}
                  disabled={updatePreference.isPending}
                >
                  <text style={{ fg: theme.muted }}>
                    {updatePreference.isPending
                      ? '[actualizando...]'
                      : '[desactivar uso de créditos]'}
                  </text>
                </Button>
              </>
            ) : (
              <>
                <text style={{ fg: theme.warning }}>
                  El uso de créditos está desactivado. Actívalo para continuar.
                </text>
                <box style={{ flexDirection: 'row', gap: 2 }}>
                  <Button
                    onClick={handleToggleFallbackToALaCarte}
                    disabled={updatePreference.isPending}
                  >
                    <text
                      style={{ fg: theme.background, bg: theme.foreground }}
                    >
                      {updatePreference.isPending
                        ? ' Activando... '
                        : ' Activar uso de créditos '}
                    </text>
                  </Button>
                  {canUpgrade ? (
                    <Button onClick={handleUpgrade}>
                      <text style={{ fg: theme.background, bg: theme.muted }}>
                        {' '}
                        Mejorar plan ↗{' '}
                      </text>
                    </Button>
                  ) : (
                    <Button onClick={handleBuyCredits}>
                      <text style={{ fg: theme.background, bg: theme.muted }}>
                        {' '}
                        Comprar créditos ↗{' '}
                      </text>
                    </Button>
                  )}
                </box>
                <text style={{ fg: theme.muted }}>
                  Tienes {remainingBalance.toLocaleString()} créditos
                  disponibles.
                </text>
              </>
            )}
          </box>
        ) : (
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>
              No hay créditos adicionales disponibles.
            </text>
            {canUpgrade ? (
              <Button onClick={handleUpgrade}>
                <text style={{ fg: theme.background, bg: theme.muted }}>
                  {' '}
                  Mejorar plan ↗{' '}
                </text>
              </Button>
            ) : (
              <Button onClick={handleBuyCredits}>
                <text style={{ fg: theme.background, bg: theme.muted }}>
                  {' '}
                  Comprar créditos ↗{' '}
                </text>
              </Button>
            )}
          </box>
        )}
      </box>
    </box>
  )
}
