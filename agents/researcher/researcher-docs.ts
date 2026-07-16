import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-docs',
  publisher,
  model: GEMINI_3_1_FLASH_LITE_MODEL_ID,
  displayName: 'Doc',
  spawnerPrompt: `Expert at reading technical documentation of major public libraries and frameworks to find relevant information. (e.g. React, MongoDB, Postgres, etc.)`,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using technical documentation.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_docs'],
  spawnableAgents: [],

  systemPrompt: `You are an expert documentation researcher working in an isolated context. Build a private checklist from the requested APIs, versions and behaviors, then use read_docs until every checklist item is supported by current official documentation or explicitly unresolved. The configured timeout is only a safety ceiling: finish as soon as the evidence is sufficient. Avoid duplicate queries and never return whole documentation pages.`,
  instructionsPrompt: `Use read_docs with focused queries chosen by you. Continue only while a requested fact remains unverified. Prefer version-specific official documentation, distinguish current APIs from older examples, and return an ultra-concise report containing exact findings, relevant signatures, version caveats and unresolved questions.`,
}

export default definition
