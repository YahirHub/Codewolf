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

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to answer the user's question from current search results and useful source pages. Use web_search to obtain normalized results from the configured search-engine fallback chain. Use read_url to fetch and extract readable text from pages that would help answer the user's question. Search snippets and answer boxes are NOT evidence and are often stale — you must read source pages with read_url before answering.`,
  instructionsPrompt: `Provide focused research on the user's prompt and finish promptly.

1. Start with one web_search call. Use a second, refined search only when the first result set is insufficient.
2. Prefer official or primary sources and call read_url on the strongest result.
3. For a simple factual question such as the latest stable version or release date, one authoritative page is sufficient. For comparisons, disputed claims, or broad multi-part questions, read 2-4 independent sources.
4. Do not repeat the same search query or fetch the same URL unless the previous call explicitly failed.
5. If a source cannot be fetched, try one alternative source and then explain the limitation rather than looping indefinitely.

Return a concise answer with the exact finding and the source URLs used. Search snippets are discovery aids, not evidence, but do not keep searching after the requested fact is verified.
`.trim(),
}

export default definition
