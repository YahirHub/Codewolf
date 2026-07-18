import {
  checkInternetConnection,
  getInternetConnectivityState,
  subscribeInternetConnectivity,
} from '@codebuff/common/util/internet-connectivity'
import { useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

// Adaptive Internet probe interval configuration.
export const HEALTH_CHECK_CONFIG = {
  INITIAL_INTERVAL: 10_000,
  OFFLINE_INTERVAL: 2_000,
  INTERVALS: [
    { successCount: 3, interval: 30_000 },
    { successCount: 6, interval: 60_000 },
    { successCount: 10, interval: 120_000 },
    { successCount: 15, interval: 300_000 },
    { successCount: 20, interval: 600_000 },
  ],
} as const

export function getNextInterval(consecutiveSuccesses: number): number {
  for (let i = HEALTH_CHECK_CONFIG.INTERVALS.length - 1; i >= 0; i--) {
    const { successCount, interval } = HEALTH_CHECK_CONFIG.INTERVALS[i]
    if (consecutiveSuccesses >= successCount) return interval
  }
  return HEALTH_CHECK_CONFIG.INITIAL_INTERVAL
}

/**
 * Monitor actual public Internet connectivity. This deliberately does not ping
 * Codebuff or the selected model provider: a provider outage must remain a
 * provider/API error, while only a real Internet outage pauses queued work.
 */
export const useConnectionStatus = (
  onReconnect?: (isInitialConnection: boolean) => void,
) => {
  const initialState = getInternetConnectivityState()
  const [isConnected, setIsConnected] = useState(initialState !== 'offline')
  const previousConnectedRef = useRef<boolean | null>(
    initialState === 'unknown' ? null : initialState === 'online',
  )
  const onReconnectRef = useRef(onReconnect)
  onReconnectRef.current = onReconnect

  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null
    let consecutiveSuccesses = 0
    let currentInterval: number = HEALTH_CHECK_CONFIG.INITIAL_INTERVAL

    const applyConnectivity = (connected: boolean) => {
      if (!isMounted) return
      const previous = previousConnectedRef.current
      setIsConnected(connected)
      previousConnectedRef.current = connected

      if (connected && previous !== true) {
        onReconnectRef.current?.(previous === null)
      }
    }

    const unsubscribe = subscribeInternetConnectivity((state) => {
      if (state === 'unknown') return
      applyConnectivity(state === 'online')
    })

    const scheduleNextCheck = (interval: number) => {
      if (!isMounted) return
      timeoutId = setTimeout(() => void checkConnection(), interval)
    }

    const checkConnection = async () => {
      try {
        const connected = await checkInternetConnection()
        if (!isMounted) return

        applyConnectivity(connected)
        if (connected) {
          consecutiveSuccesses += 1
          currentInterval = getNextInterval(consecutiveSuccesses)
        } else {
          consecutiveSuccesses = 0
          currentInterval = HEALTH_CHECK_CONFIG.OFFLINE_INTERVAL
        }
      } catch (error) {
        logger.debug({ error }, 'Internet connectivity probe failed')
        if (!isMounted) return
        applyConnectivity(false)
        consecutiveSuccesses = 0
        currentInterval = HEALTH_CHECK_CONFIG.OFFLINE_INTERVAL
      }
      scheduleNextCheck(currentInterval)
    }

    void checkConnection()

    return () => {
      isMounted = false
      unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  return isConnected
}
