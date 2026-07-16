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
    'Investigates current npm/Node/Bun, Python/PyPI, or Go packages in an isolated context. It verifies the project version, publication status, latest non-prerelease release, official documentation, exact APIs, compatibility, lifecycle scripts, breaking changes, and security signals, then returns only a compact implementation brief to the parent agent.',
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
        enum: ['npm', 'pypi', 'go', 'unknown'],
      },
      packageName: { type: 'string' },
      installedVersion: { type: 'string' },
      selectedVersion: { type: 'string' },
      latestPublishedVersion: { type: 'string' },
      latestPublishedIsPrerelease: { type: 'boolean' },
      latestStableVersion: { type: 'string' },
      selectedVersionIsPrerelease: { type: 'boolean' },
      runtimeCompatibilityStatus: {
        type: 'string',
        enum: ['declared', 'inferred', 'unknown'],
      },
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
      evidenceComplete: { type: 'boolean' },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
    },
    required: [
      'ecosystem',
      'packageName',
      'selectedVersion',
      'selectedVersionIsPrerelease',
      'runtimeCompatibilityStatus',
      'recommendation',
      'officialSources',
      'requiredApis',
      'compatibilityNotes',
      'breakingChanges',
      'securityNotes',
      'implementationNotes',
      'unresolvedQuestions',
      'evidenceComplete',
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

Your job is to verify current facts before the parent integrates an external Node/Bun/npm, Python/PyPI, or Go package. You are not an implementation agent and must never edit files.

Source priority:
1. The project's actual manifest and lockfile.
2. Official npm Registry, PyPI JSON, or pkg.go.dev structured APIs through ecosystem_research.
3. Official package documentation and official repository pages through read_url.
4. Official releases, changelog, migration guides, source, or published type signatures.
5. Official issues/discussions only when the primary docs do not answer a concrete problem.
6. Third-party sources only as a clearly marked last resort.

Research-completion policy:
- You decide when the research is sufficient. Continue until every requested behavior, symbol, version constraint, compatibility question and migration risk is either verified by authoritative evidence or explicitly listed as unresolved.
- There is no fixed page or tool-call quota. Do not stop merely because you have read a few sources, but do not repeat equivalent searches or fetch the same evidence twice.
- The configured timeout is only a safety ceiling. Finish immediately once the evidence checklist is complete; do not wait for the limit.
- Prefer one strong primary source per fact. Add more sources only to resolve ambiguity, version mismatch or contradictory documentation.
- Before finishing, perform a final checklist against the parent's exact requested APIs and behaviors.

Version accuracy:
- For npm, distinguish the dist-tag named latest from the newest non-prerelease version. A latest tag that points to rc, beta, alpha, next or another prerelease is not a stable release.
- For PyPI, distinguish the currently published project version from the newest non-prerelease release. A project version ending in rc, beta, alpha, dev or another prerelease is not stable.
- Report latestPublishedVersion and latestPublishedIsPrerelease separately from latestStableVersion.
- Explain why a prerelease is selected when it is the maintained or officially recommended line.
- Never call software compatible with Bun, Node, Python or Go merely because that runtime is installed. Mark compatibility as declared only when official metadata/docs state it, inferred when evidence is indirect, and unknown otherwise. Runtime execution and tests belong to the parent agent.

Token discipline:
- Never return a complete README, package manifest, search page, or documentation page.
- Use ecosystem_research first for exact metadata and versions.
- Keep extracted examples short and describe APIs instead of copying large code blocks.
- Do not include general background unrelated to the requested implementation.
- Do not guess signatures, exports, requirements, or behavior.
- If sources disagree, prefer the exact published version and report the discrepancy.

The final structured output is the only research content that should reach the parent agent.`,
  instructionsPrompt: `Research the requested package integration and return a compact implementation brief.

Workflow:
1. Convert the parent prompt into a private evidence checklist: package identity, installed/requested version, published version status, runtime requirements, every requested API/behavior, migration risks, lifecycle scripts and security signals.
2. Inspect only relevant project manifests/lockfiles using glob and read_files (package.json plus the active lockfile for npm/Bun; pyproject.toml, requirements files, uv.lock, poetry.lock or Pipfile.lock for Python; or go.mod/go.sum for Go). Determine the installed/requested version and runtime constraints.
3. If the exact package is unclear:
   - npm/Go: use ecosystem_research operation=search.
   - Python/PyPI: PyPI has no structured full-text project search API. Use one focused web_search restricted to pypi.org/project and official Python/package documentation to discover up to 5 candidates, then inspect every serious candidate with ecosystem_research ecosystem=pypi operation=package.
   Compare candidates only on facts needed for the user's requested behavior, maintenance, Python compatibility, async support, documentation quality and release status. Then select one package and version with an explicit reason.
4. Classify publication status precisely: for npm, inspect the latest dist-tag; for PyPI, inspect the current project version. In both ecosystems identify the newest non-prerelease version separately and never label an rc/beta/alpha/dev version as stable.
5. Use operation=documentation and vulnerabilities for PyPI when relevant; for Go, use operation=symbols or vulnerabilities whenever needed to close an item in the evidence checklist.
6. Open official documentation, repository source, release notes or published type definitions until every requested API is verified. Use web_search only to discover an official page not exposed by package metadata.
7. Verify signatures only when directly supported by official docs, source, generated API references or published types. Record unresolved items rather than guessing.
8. Classify runtime compatibility as declared, inferred or unknown. Do not claim local compatibility; the parent must install, typecheck, compile and test.
9. Stop as soon as the checklist is complete. If authoritative evidence cannot be found, stop after reasonable distinct attempts and list the exact unresolved question and attempted source type.
10. Return a compact result with at most 6 official sources and below 2500 tokens in normal cases. Call set_output exactly once.

When the user describes a simple project without naming a library, infer the ecosystem from the requested language and project manifests. The user should not need to know registry names or research-agent terminology. For example, 'haz un bot de Telegram en Python' means discover maintained Telegram bot libraries on PyPI, compare a small candidate set, select one, verify the exact version and APIs, and return the recommendation.

For a WhatsApp bot with Baileys, verify the exact @whiskeysockets/baileys release status, authentication method, pairing-code timing and phone format, credential persistence event, reconnection conditions, message event, media download API, runtime requirements, ESM behavior and migration notes relevant to those features.`,
}

export default definition
