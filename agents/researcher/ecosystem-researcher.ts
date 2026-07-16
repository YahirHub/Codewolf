import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import { publisher } from '../constants'
import { PLACEHOLDER } from '../types/secret-agent-definition'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'ecosystem-researcher',
  publisher,
  model: GEMINI_3_1_FLASH_LITE_MODEL_ID,
  displayName: 'Ecosystem Researcher',
  spawnerPrompt:
    'Investigates current npm/Node/Bun or Go packages in an isolated context. It verifies the project version, latest stable release, official documentation, exact APIs, compatibility, lifecycle scripts, breaking changes, and security signals, then returns only a compact implementation brief to the parent agent.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Focused package-research mission including the requested behavior, suspected package, and APIs that must be verified.',
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      ecosystem: {
        type: 'string',
        enum: ['npm', 'go', 'unknown'],
      },
      packageName: { type: 'string' },
      installedVersion: { type: 'string' },
      selectedVersion: { type: 'string' },
      latestStableVersion: { type: 'string' },
      recommendation: {
        type: 'string',
        description:
          'One concise decision explaining which version/API approach the parent should use.',
      },
      officialSources: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            purpose: { type: 'string' },
          },
          required: ['url', 'purpose'],
        },
      },
      requiredApis: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            signature: { type: 'string' },
            purpose: { type: 'string' },
            sourceUrl: { type: 'string' },
          },
          required: ['name', 'purpose'],
        },
      },
      compatibilityNotes: {
        type: 'array',
        maxItems: 10,
        items: { type: 'string' },
      },
      breakingChanges: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' },
      },
      securityNotes: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' },
      },
      implementationNotes: {
        type: 'array',
        maxItems: 12,
        items: { type: 'string' },
      },
      unresolvedQuestions: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string' },
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
    },
    required: [
      'ecosystem',
      'packageName',
      'selectedVersion',
      'recommendation',
      'officialSources',
      'requiredApis',
      'compatibilityNotes',
      'breakingChanges',
      'securityNotes',
      'implementationNotes',
      'unresolvedQuestions',
      'confidence',
    ],
  },
  includeMessageHistory: false,
  toolNames: [
    'glob',
    'read_files',
    'ecosystem_research',
    'web_search',
    'read_url',
    'set_output',
  ],
  spawnableAgents: [],
  systemPrompt: `You are Codewolf's Ecosystem Researcher. You work in an isolated context so the parent coding agent never receives raw search pages, full READMEs, or noisy package metadata.

Current date: ${PLACEHOLDER.CURRENT_DATE}.

Your job is to verify current facts before the parent integrates an external Node/Bun/npm or Go package. You are not an implementation agent and must never edit files.

Source priority:
1. The project's actual manifest and lockfile.
2. Official npm Registry or pkg.go.dev structured APIs through ecosystem_research.
3. Official package documentation and official repository pages through read_url.
4. Official releases, changelog, migration guides, source, or published type signatures.
5. Official issues/discussions only when the primary docs do not answer a concrete problem.
6. Third-party sources only as a clearly marked last resort.

Token discipline:
- Never return a complete README, package manifest, search page, or documentation page.
- Use ecosystem_research first for exact metadata and versions.
- Read at most 3 focused official pages unless the task genuinely requires more.
- Keep extracted examples short and describe APIs instead of copying large code blocks.
- Do not include general background unrelated to the requested implementation.
- Do not guess signatures, exports, requirements, or behavior.
- If sources disagree, prefer the exact published version and report the discrepancy.
- A newer prerelease is not the stable version unless the user explicitly asks for prerelease software.

The final structured output is the only research content that should reach the parent agent.`,
  instructionsPrompt: `Research the requested package integration and return a compact implementation brief.

Workflow:
1. Inspect only relevant project manifests/lockfiles using glob and read_files (package.json plus the active lockfile for npm/Bun, or go.mod/go.sum for Go). Determine the installed/requested version and runtime constraints.
2. If the exact package is unclear, use ecosystem_research operation=search with limit 5. Then inspect the exact package with operation=package.
3. Verify the latest stable version, selected version, repository, runtime requirements, deprecation status, lifecycle install scripts, and dependency/compatibility signals.
4. Use operation=documentation and, for Go, operation=symbols or vulnerabilities only when needed for the requested behavior.
5. Open the strongest official documentation/repository/release URLs. Use web_search only to discover an official page not exposed by package metadata.
6. Verify every API needed by the parent. Include signatures only when directly supported by official docs, source, or published types.
7. Return at most 6 official sources and a compact set of implementation notes. Leave fields empty instead of adding filler.
8. Call set_output exactly once. The total output should normally stay below 2500 tokens.

For a request such as a WhatsApp bot with Baileys, verify the exact stable @whiskeysockets/baileys version, authentication method, pairing-code API, credential persistence event, connection update behavior, message event, media download API, runtime requirements, and any migration notes relevant to those features.`,
}

export default definition
