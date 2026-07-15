import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { PRIMARY_KNOWLEDGE_FILE_NAME } from '@codebuff/common/constants/knowledge'

// @ts-expect-error - Bun text import attribute not supported by TypeScript
import agentDefinitionSource from '../../../common/src/templates/initial-agents-dir/types/agent-definition' with { type: 'text' }
// @ts-expect-error - Bun text import attribute not supported by TypeScript
import toolsSource from '../../../common/src/templates/initial-agents-dir/types/tools' with { type: 'text' }
// @ts-expect-error - Bun text import attribute not supported by TypeScript
import utilTypesSource from '../../../common/src/templates/initial-agents-dir/types/util-types' with { type: 'text' }
import { getProjectRoot } from '../project-files'
import { trackEvent } from '../utils/analytics'
import { getSystemMessage } from '../utils/message-history'
import { isProjectContextEnabled } from '../utils/settings'

import type { PostUserMessageFn } from '../types/contracts/send-message'

const brandName = 'Codewolf'

const INITIAL_KNOWLEDGE_FILE = `# Project knowledge

This file gives ${brandName} context about your project: goals, commands, conventions, and gotchas.

## Quickstart
- Setup:
- Dev:
- Test:

## Architecture
- Key directories:
- Data flow:

## Conventions
- Formatting/linting:
- Patterns to follow:
- Things to avoid:
`

const COMMON_TYPE_FILES = [
  {
    fileName: 'agent-definition.ts',
    source: agentDefinitionSource,
  },
  {
    fileName: 'tools.ts',
    source: toolsSource,
  },
  {
    fileName: 'util-types.ts',
    source: utilTypesSource,
  },
]

export function handleInitializationFlowLocally(): {
  postUserMessage: PostUserMessageFn
} {
  const projectRoot = getProjectRoot()
  const knowledgePath = path.join(projectRoot, PRIMARY_KNOWLEDGE_FILE_NAME)
  const messages: string[] = []

  if (isProjectContextEnabled()) {
    messages.push(
      '🧭 Contexto persistente activo: `/init` creará o actualizará `contexto/` después de analizar el proyecto.',
    )
  }

  if (existsSync(knowledgePath)) {
    messages.push(`📋 \`${PRIMARY_KNOWLEDGE_FILE_NAME}\` ya existe.`)
  } else {
    writeFileSync(knowledgePath, INITIAL_KNOWLEDGE_FILE)
    messages.push(`✅ Se creó \`${PRIMARY_KNOWLEDGE_FILE_NAME}\``)

    // Track knowledge file creation
    trackEvent(AnalyticsEvent.KNOWLEDGE_FILE_UPDATED, {
      action: 'created',
      fileName: PRIMARY_KNOWLEDGE_FILE_NAME,
      fileSizeBytes: Buffer.byteLength(INITIAL_KNOWLEDGE_FILE, 'utf8'),
    })
  }

  const agentsDir = path.join(projectRoot, '.agents')
  const agentsTypesDir = path.join(agentsDir, 'types')

  if (existsSync(agentsDir)) {
    messages.push('📋 `.agents/` ya existe.')
  } else {
    mkdirSync(agentsDir, { recursive: true })
    messages.push('✅ Se creó `.agents/`')
  }

  if (existsSync(agentsTypesDir)) {
    messages.push('📋 `.agents/types/` ya existe.')
  } else {
    mkdirSync(agentsTypesDir, { recursive: true })
    messages.push('✅ Se creó `.agents/types/`')
  }

  for (const { fileName, source } of COMMON_TYPE_FILES) {
    const targetPath = path.join(agentsTypesDir, fileName)
    if (existsSync(targetPath)) {
      messages.push(`📋 \`.agents/types/${fileName}\` ya existe.`)
      continue
    }

    try {
      if (!source || source.trim().length === 0) {
        throw new Error('El contenido de origen está vacío')
      }
      writeFileSync(targetPath, source)
      messages.push(`✅ Se copió \`.agents/types/${fileName}\``)
    } catch (error) {
      messages.push(
        `⚠️ No se pudo copiar \`.agents/types/${fileName}\`: ${
          error instanceof Error
            ? error.message
            : String(error ?? 'Desconocido')
        }`,
      )
    }
  }

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    ...messages.map((message) => getSystemMessage(message)),
  ]
  return { postUserMessage }
}
