import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: GEMINI_3_1_FLASH_LITE_MODEL_ID,
  displayName: 'Web Researcher',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_url'],
  spawnableAgents: [],

  systemPrompt: `You are an expert web researcher working in an isolated context. Build a private evidence checklist from the user's exact question, search current primary sources, and stop as soon as every checklist item is verified or explicitly unresolved. The configured timeout is only a safety ceiling, not a target. Search snippets and answer boxes are discovery aids, not evidence; read the source pages before concluding. Avoid duplicate queries and do not return raw pages to the parent agent.`,
  instructionsPrompt: `Research the user's prompt using as many distinct, focused searches and source reads as the evidence checklist genuinely requires.

- Prefer official and primary sources. Read the strongest source pages with read_url before treating a fact as verified.
- Continue while a requested fact, date, version, API or disputed claim lacks adequate evidence; stop immediately when the checklist is complete.
- Do not repeat equivalent queries or fetch the same URL twice unless the previous attempt failed.
- Use multiple independent sources only when the question is broad, disputed, comparative or a primary source is incomplete.
- If a source cannot be fetched, try a materially different authoritative source. Record the limitation instead of looping.
- Return a concise synthesis with exact findings, source URLs and unresolved questions. Never return full pages or search-result dumps.
`.trim(),
}

export default definition
