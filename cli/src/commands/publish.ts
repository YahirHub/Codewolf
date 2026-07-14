import { WEBSITE_URL } from '@codebuff/sdk'

import { getUserCredentials } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import {
  loadAgentDefinitions,
  getLoadedAgentsData,
} from '../utils/local-agent-registry'

import type {
  PublishAgentsErrorResponse,
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'

export interface PublishResult {
  success: boolean
  publisherId?: string
  agents?: Array<{
    id: string
    version: string
    displayName: string
  }>
  error?: string
  details?: string
  hint?: string
}

/**
 * Publish agent templates to the backend
 */
async function publishAgentTemplates(
  data: Record<string, any>[],
  authToken: string,
  allLocalAgentIds: string[],
): Promise<PublishAgentsResponse & { statusCode?: number }> {
  setApiClientAuthToken(authToken)
  const apiClient = getApiClient()

  try {
    const response = await apiClient.publish(data, allLocalAgentIds)

    if (!response.ok) {
      // Try to use the full error data if available (includes details, hint, etc.)
      const errorData = response.errorData as
        Partial<PublishAgentsErrorResponse> | undefined
      return {
        success: false,
        error: errorData?.error ?? response.error ?? 'Error desconocido',
        details: errorData?.details,
        hint: errorData?.hint,
        availablePublishers: errorData?.availablePublishers,
        validationErrors: errorData?.validationErrors,
        statusCode: response.status,
      }
    }

    // Guard against empty/undefined response data
    if (!response.data) {
      return {
        success: false,
        error:
          'No se pudo interpretar la respuesta del servidor: el cuerpo está vacío',
        statusCode: response.status,
      }
    }

    return {
      ...response.data,
      statusCode: response.status,
    }
  } catch (err: any) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        success: false,
        error: `Error de red: no se pudo conectar con ${WEBSITE_URL}. Comprueba tu conexión a internet y vuelve a intentarlo.`,
      }
    }

    const body = err?.responseBody || err?.body || err
    const error = body?.error || body?.message || 'No se pudo publicar'
    const details = body?.details
    const hint = body?.hint

    return {
      success: false,
      error,
      details,
      hint,
    }
  }
}

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentIds The ids or display names of the agents to publish
 * @returns PublishResult with success/error information
 */
export async function handlePublish(
  agentIds: string[],
): Promise<PublishResult> {
  const user = getUserCredentials()

  if (!user) {
    return {
      success: false,
      error: 'No has iniciado sesión',
      hint: 'Primero inicia sesión mediante el comando "login" o la interfaz web.',
    }
  }

  const availableAgents = getLoadedAgentsData()?.agents || []

  if (agentIds?.length === 0) {
    return {
      success: false,
      error: 'No se especificaron agentes',
      hint: 'Uso: publish <id-agente> [id-agente2] ...',
    }
  }

  try {
    const loadedDefinitions = loadAgentDefinitions()

    if (loadedDefinitions.length === 0) {
      return {
        success: false,
        error:
          'No se encontraron plantillas de agentes válidas en el directorio .agents.',
      }
    }

    const matchingTemplates: Record<string, any> = {}

    for (const agentId of agentIds) {
      // Find the specific agent
      const matchingTemplate = loadedDefinitions.find(
        (template) =>
          template.id === agentId ||
          (template as { displayName?: string }).displayName === agentId,
      )

      if (!matchingTemplate) {
        const availableList = availableAgents
          .map((agent) =>
            agent.displayName && agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName || agent.id,
          )
          .join(', ')
        return {
          success: false,
          error: `No se encontró el agente "${agentId}"`,
          details: `Agentes disponibles: ${availableList}`,
        }
      }

      // Process the template for publishing
      const processedTemplate = { ...matchingTemplate }

      // Convert handleSteps function to string if present
      if (typeof (matchingTemplate as any).handleSteps === 'function') {
        ;(processedTemplate as any).handleSteps = (
          matchingTemplate as any
        ).handleSteps.toString()
      }

      matchingTemplates[matchingTemplate.id] = processedTemplate
    }

    // Get all local agent IDs so the server knows which agents exist locally
    // (even if not being published) for validation purposes
    const allLocalAgentIds = loadedDefinitions.map((template) => template.id)

    const result = await publishAgentTemplates(
      Object.values(matchingTemplates),
      user.authToken!,
      allLocalAgentIds,
    )

    if (result.success) {
      return {
        success: true,
        publisherId: result.publisherId,
        agents: result.agents ?? [],
      }
    }

    // Build error result
    let errorMessage = result.error
    let hint = result.hint
    if (result.error?.includes('Publisher field required')) {
      errorMessage = 'Las plantillas requieren el campo "publisher".'
      hint = 'Agrega un campo "publisher" a las plantillas de tus agentes.'
    } else if (
      result.error?.includes('Publisher not found or not accessible')
    ) {
      errorMessage = 'No se encontró el publicador o no tienes acceso.'
      hint = `Comprueba que el ID del publicador sea correcto y que tengas acceso. Visita ${WEBSITE_URL}/publishers para administrar publicadores.`
    }

    return {
      success: false,
      error: errorMessage,
      details: result.details,
      hint,
    }
  } catch (error) {
    return {
      success: false,
      error: 'La publicación falló',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
