import { validateAgents } from '@codebuff/sdk'
import { useCallback, useState } from 'react'

import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'

export type ValidationError = {
  id: string
  message: string
}

export type ValidationCheckResult = {
  success: boolean
  errors: ValidationError[]
}

type UseAgentValidationResult = {
  validationErrors: ValidationError[]
  isValidating: boolean
  validate: () => Promise<ValidationCheckResult>
}

/**
 * Validate agent definitions locally before sending a turn.
 *
 * Codewolf intentionally does not call the legacy Codebuff validation service:
 * local syntax/schema errors block the turn, while Internet/provider failures
 * are handled independently by the connectivity and provider layers.
 */
export const useAgentValidation = (): UseAgentValidationResult => {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [isValidating, setIsValidating] = useState(false)

  const validate = useCallback(async (): Promise<ValidationCheckResult> => {
    setIsValidating(true)

    try {
      const agentDefinitions = loadAgentDefinitions()
      const validationResult = await validateAgents(agentDefinitions, {
        remote: false,
      })
      const errors = validationResult.validationErrors
      setValidationErrors(errors)
      return { success: validationResult.success, errors }
    } catch (error) {
      logger.error({ error }, 'Local agent validation failed with exception')
      const errors = [
        {
          id: 'local_validation_error',
          message:
            error instanceof Error
              ? error.message
              : 'La validación local del agente falló inesperadamente.',
        },
      ]
      setValidationErrors(errors)
      return { success: false, errors }
    } finally {
      setIsValidating(false)
    }
  }, [])

  return {
    validationErrors,
    isValidating,
    validate,
  }
}
