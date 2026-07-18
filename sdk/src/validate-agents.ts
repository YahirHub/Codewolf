import {
  validateAgents as validateAgentsCommon,
  type DynamicAgentValidationError,
} from '@codebuff/common/templates/agent-validation'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

export interface ValidationResult {
  success: boolean
  validationErrors: Array<{
    id: string
    message: string
  }>
  errorCount: number
}

export interface ValidateAgentsOptions {
  /** @deprecated Validation is always local; retained for API compatibility. */
  remote?: boolean

  /** @deprecated Ignored. Validation never contacts a remote service. */
  websiteUrl?: string
}

/**
 * Validates an array of agent definitions.
 *
 * Performs local Zod/schema validation only. Remote validation options are
 * accepted for backwards compatibility but intentionally ignored.
 *
 * @param definitions - Array of agent definitions to validate
 * @param options - Optional configuration for validation
 * @returns Promise<ValidationResult> - Validation results with any errors
 *
 * @example
 * ```typescript
 * // Local validation only
 * const result = await validateAgents(definitions)
 * ```
 */
export async function validateAgents(
  definitions: AgentDefinition[],
  _options?: ValidateAgentsOptions,
): Promise<ValidationResult> {
  // Convert array of definitions to Record<string, AgentDefinition> format
  // that the common validation functions expect
  // Use index as key to preserve all entries (including duplicates)
  const agentTemplates: Record<string, AgentDefinition> = {}
  for (const [index, definition] of definitions.entries()) {
    // Handle null/undefined gracefully
    if (!definition) {
      agentTemplates[`agent_${index}`] = definition
      continue
    }
    // Use index to ensure duplicates aren't overwritten
    const key = definition.id ? `${definition.id}_${index}` : `agent_${index}`
    agentTemplates[key] = definition
  }

  // Simple logger implementation for common validation functions
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }

  // Validation is intentionally local-only. The `remote` and `websiteUrl`
  // options are retained for source compatibility but never trigger network
  // traffic. This guarantees that sending a prompt cannot be blocked by an
  // unrelated Codebuff service.
  const result = validateAgentsCommon({
    agentTemplates,
    logger,
  })
  const validationErrors: DynamicAgentValidationError[] =
    result.validationErrors

  // Transform validation errors to the SDK format
  const transformedErrors = validationErrors.map((error) => ({
    id: error.filePath ?? 'unknown',
    message: error.message,
  }))

  return {
    success: transformedErrors.length === 0,
    validationErrors: transformedErrors,
    errorCount: transformedErrors.length,
  }
}
