import { pluralize } from '@codebuff/common/util/string'
import { useMemo } from 'react'

import { formatQueuedPreview } from '../utils/helpers'

import type { QueuedMessage } from './use-message-queue'

interface UseQueueUiParams {
  queuePaused: boolean
  queuedMessages: QueuedMessage[]
  separatorWidth: number
  terminalWidth: number
}

export const useQueueUi = ({
  queuePaused,
  queuedMessages,
  separatorWidth,
  terminalWidth,
}: UseQueueUiParams) => {
  const queuedCount = queuedMessages.length
  const shouldShowQueuePreview = queuedCount > 0 && !queuePaused

  const queuePreviewTitle = useMemo(() => {
    if (!shouldShowQueuePreview) return undefined
    const previewWidth = Math.max(30, separatorWidth - 20)
    return formatQueuedPreview(queuedMessages, previewWidth)
  }, [shouldShowQueuePreview, queuedMessages, separatorWidth])

  const pausedQueueText = useMemo(() => {
    if (!queuePaused || queuedCount === 0) return undefined
    return `${queuedCount} mensaje${queuedCount === 1 ? '' : 's'} en cola — tu próximo mensaje se enviará primero`
  }, [queuePaused, queuedCount])

  const inputPlaceholder = useMemo(() => {
    const base =
      terminalWidth < 65
        ? 'Escribe una tarea de programación'
        : 'Escribe una tarea de programación o / para ver comandos'

    if (queuePaused && queuedCount > 0) {
      return 'Ctrl+C cancela los mensajes en cola'
    }

    return base
  }, [queuePaused, queuedCount, terminalWidth])

  return {
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,
  }
}
