# Codewolf

Codewolf is a terminal coding editor with configurable model providers, multi-provider web search, persistent skills, and shared state under `~/.codewolf`.

## Key Technologies

- TypeScript monorepo
- Bun runtime and package manager
- OpenTUI + React CLI
- JS/TS SDK
- Composable agent runtime

## Repo Map

- `cli/` - TUI client and local UX
- `sdk/` - JS/TS SDK used by the CLI and external users
- `common/` - shared types, tools, schemas, and utilities
- `agents/` - public agent definitions
- `packages/agent-runtime/` - agent runtime and tool handling
- `packages/code-map/` - source parsing helpers
- `packages/llm-providers/` - public LLM provider shims
- `freebuff/` - Freebuff CLI, release files, and e2e tests
- `scripts/tmux/` - tmux helpers for CLI testing

## Conventions

- Use `bun install` and `bun run`.
- Prefer dependency injection over module mocking.
- Run interactive CLI tests in tmux.
- Do not force-push `main`.

## Docs

- `docs/agents-and-tools.md`
- `docs/testing.md`

## Custom Provider Architecture

- The CLI owns persistent provider metadata and secrets in `cli/src/utils/custom-providers.ts`; the SDK must receive only the resolved active configuration.
- `providers.json` and `provider-auth.json` must remain separate. API keys entered through `/login` must stay masked and must never enter chat history, logs, analytics payloads, or terminal titles.
- An active custom provider is a global model override for the main agent and all subagents. `extractSubagentContextParams` must preserve `customProvider`; otherwise spawned agents silently fall back to the original backend. Switching provider/model must reset the cached CLI SDK client.
- Direct-provider mode must not send Codebuff/OpenRouter-only request options or call Codebuff user validation, billing, remote agent lookup, or run persistence.
- Provider configuration is editor-only: `/login` opens the provider wizard and `/models` opens the grouped selector. Do not reintroduce standalone `codebuff provider` or `codebuff model` management commands.
- The full editor must remain reachable without prior credentials so a fresh installation can configure its first provider; Freebuff keeps its existing authentication/session gate and does not expose these flows.
- Preserve the original backend behavior when no custom provider is active.
- Update `docs/custom-providers.md` and `contexto/` when this architecture or its command surface changes.
- Every `RunState` returned by the SDK must be plain JSON data. Never retain live Zod/tool schema instances in `AgentState.toolDefinitions`; convert them to JSON Schema before storage and normalize the final `prompt-response` session at the SDK boundary so a later `previousRun` cannot fail on circular references.

## Multi-provider Web Search Architecture

- Native `web_search` must run locally through the adapters in `common/src/web-search`; never route active searches through the upstream `/api/v1/web-search` endpoint.
- Supported engines are Tavily, Brave Search, Exa, Linkup, Firecrawl, SerpApi, and Zenserp. Keep their outputs normalized so agents do not depend on a provider-specific payload.
- Search configuration is editor-only through `/setup-search` (`/search-setup` and `/search` aliases). Do not add standalone CLI flags or subcommands for API keys.
- Persist non-secret state in `~/.codewolf/search.json` and keys in `~/.codewolf/search-auth.json`. Development and compiled binaries must use the same files.
- A provider without an explicit saved key is inactive. Do not silently activate providers from environment variables.
- Always try the selected default first and then active fallbacks in user-defined order. Network errors, timeouts, rate limits, invalid responses, and empty result sets must advance to the next provider.
- If the default provider becomes unavailable, reassign the first active fallback. The UI and runtime must agree on the effective default.
- Keep API keys out of chat history, terminal titles, logs, analytics, tool outputs, and error messages. Preserve the metadata/auth file separation in tests.
- Update `docs/search-providers.md`, `contexto/`, and focused adapter/fallback tests whenever provider behavior changes.

## Subagent Lifecycle Safety

- Match `spawn_agents` placeholders by normalized agent type and prompt, not by type alone; same-type agents may start out of order.
- Exact duplicate spawn requests must execute once. Deduplicate within one `spawn_agents` array and across separate/direct agent tool calls in the same model response using normalized agent type, prompt, and params.
- OpenAI-compatible stream parsers must associate tool calls by provider ID and emit a completed ID once even if the gateway restarts or changes its array index.
- The TUI must treat `spawn_agents` placeholders and matching `subagent_start` events as one semantic card. Replayed starts with a new ID must not create a second card.
- Every subagent must emit `subagent_finish` from a `finally` path. Errors, aborts, and timeouts must never leave a permanent `running` card.
- Use an isolated abort controller and bounded execution for each subagent. `researcher-web` is capped at 120 seconds; a stalled provider must not block the parent turn indefinitely.
- Ignore late chunks after a subagent times out and close unresolved UI placeholders when the root stream finishes.
- `researcher-web` should scale source depth to the question: one authoritative page is enough for a simple release/version fact; avoid fixed minimum page counts that create unnecessary loops.

## Codewolf Brand and Binary Distribution

- The user-facing product name is Codewolf. The TUI logo, terminal title, help output, exported conversations, model selector, and base-agent identity must not display Codebuff.
- The standalone executable is `codewolf` on Linux/macOS and `codewolf.exe` on Windows. Keep `tree-sitter.wasm` beside the executable.
- Internal `@codebuff/*` workspace imports and legacy `CODEBUFF_*` environment keys remain compatibility details until a dedicated namespace migration; never expose them as the product brand.
- `.github/workflows/build-binaries.yml` runs only through `workflow_dispatch`, cross-compiles Windows from one Linux runner, and publishes numeric releases without a `v` prefix. The first release is `1.0.0`; later runs increment the patch number of the latest numeric tag. Preserve one dependency installation, reused agent/SDK builds, serialized release concurrency, and release creation only after both binaries pass validation.
- User-visible CLI dialogs, navigation hints, warnings, errors, onboarding text, and status labels are Spanish. Keep slash commands, command-line flags, protocol values, agent IDs, tool names, environment keys, and internal prompts unchanged unless a dedicated compatibility migration is requested.
