/**
 * Internal prompts that must reach the agent runtime unchanged.
 *
 * These are control signals, not ordinary user messages. Prefixing project
 * context, pending terminal output, or attachment text would turn them into a
 * normal prompt and disable the runtime behavior they trigger.
 */
export function isManualCompactPrompt(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === '/compact' || normalized === 'compact'
}

export function buildEffectiveAgentPrompt(params: {
  rawContent: string
  promptWithTransientContext: string
  hasMessageContent: boolean
  projectContextEnabled: boolean
  projectContextInstruction: string
}): string {
  if (isManualCompactPrompt(params.rawContent)) {
    return '/compact'
  }

  const trimmedPrompt = params.promptWithTransientContext.trim()
  const prompt =
    trimmedPrompt.length > 0
      ? params.promptWithTransientContext
      : params.hasMessageContent
        ? 'Consulta las imágenes adjuntas'
        : ''

  if (!params.projectContextEnabled) {
    return prompt
  }

  return `${params.projectContextInstruction}\n\n${prompt}`.trim()
}
