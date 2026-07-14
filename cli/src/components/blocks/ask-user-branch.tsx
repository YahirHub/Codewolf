import { TextAttributes } from '@opentui/core'
import React from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'

import type { AskUserContentBlock } from '../../types/chat'

interface AskUserBranchProps {
  block: AskUserContentBlock
  availableWidth: number
}

export const AskUserBranch = ({
  block,
  availableWidth,
}: AskUserBranchProps) => {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        width: Math.max(10, availableWidth - 2),
        borderStyle: 'single',
        borderColor: theme.secondary,
        customBorderChars: BORDER_CHARS,
        padding: 1,
        marginTop: 1,
        marginBottom: 1,
      }}
    >
      {block.skipped ? (
        <text style={{ fg: theme.muted, attributes: TextAttributes.ITALIC }}>
          Omitiste{' '}
          {block.questions.length === 1 ? 'la pregunta' : 'las preguntas'}.
        </text>
      ) : (
        <box style={{ flexDirection: 'column', gap: 1 }}>
          <text
            style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}
          >
            {block.questions.length === 1 ? 'Tu respuesta' : 'Tus respuestas'}:
          </text>
          {block.questions.map((q, idx) => {
            const answer = block.answers?.find((a) => a.questionIndex === idx)

            // Determine display answer based on answer type
            let displayAnswer: string
            let isCustomAnswer = false

            if (answer?.otherText) {
              // Custom text input
              displayAnswer = `"${answer.otherText}"`
              isCustomAnswer = true
            } else if (answer?.selectedOptions) {
              // Multi-select: join options with commas
              displayAnswer = answer.selectedOptions.join(', ')
            } else if (answer?.selectedOption) {
              // Single-select
              displayAnswer = answer.selectedOption
            } else {
              displayAnswer = 'Sin respuesta'
            }

            return (
              <box key={idx} style={{ flexDirection: 'column', gap: 0 }}>
                <text style={{ fg: theme.foreground }}>
                  {idx + 1}. {q.question}
                </text>
                <text
                  style={{
                    fg: theme.primary,
                    marginLeft: 2,
                    attributes: isCustomAnswer
                      ? TextAttributes.ITALIC
                      : undefined,
                  }}
                >
                  ↳ {displayAnswer}
                </text>
              </box>
            )
          })}
        </box>
      )}
    </box>
  )
}
