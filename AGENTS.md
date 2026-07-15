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
- `docs/custom-providers.md`
- `docs/chat-sessions.md`

## Persistent Project Context

- `contexto/000-contexto-maestro.md` is the mandatory entry point when resuming from a ZIP or a fresh session. Read it, then `README.md`, `AGENTS.md`, and the remaining numbered context files in order before substantial changes.
- Every architecture change, feature, important bug, security decision, build change, or deployment decision must create the next numbered file in `contexto/` with date, objective, decisions, architecture, libraries, files, problems, solutions, pending work, and next steps.
- When code and an older context file disagree, verify the code and update the newest context document instead of silently trusting stale notes.

## Custom Edition Without Monetization

- Codewolf does not expose ads, credits, subscriptions, purchase links, or commercial rate-limit dialogs. Do not register `/subscribe`, `/ads:enable`, `/ads:disable`, or aliases such as `/strong`, `/sub`, `/buy-credits`, and `/credits`. `/usage` is reserved exclusively for local technical token statistics and must never query billing, balances, quotas, or prices.
- The chat must not query subscription/usage endpoints, request ads, display credit counters, or replace the editor with a purchase banner. Provider errors stay ordinary actionable errors.
- Upstream compatibility modules may remain temporarily if shared packages still reference them, but they must be unreachable from the Codewolf CLI. Remove them only in a dedicated tested cleanup.

## Local Token Usage Architecture

- `/usage` displays local technical token statistics only. It must not expose prices, credits, subscriptions, balances, or provider quota claims.
- Capture usage at the shared LLM boundary so the main agent, subagents, non-streaming calls, streaming calls, and structured calls use the same accounting path.
- Prefer input/output/total token values reported by the provider. If either side is missing, calculate the missing value locally and label the event `mixed`; if no values are reported, label it `local`. Never present a local estimate as provider-reported.
- Persist append-only numeric metadata in `~/.codewolf/usage.jsonl`. Never store prompts, responses, tool results, file contents, images, API keys, or authorization headers in usage records.
- Development and compiled binaries must share the same file. Retain at most 90 days and 10,000 events, compacting only when the file reaches the configured threshold.
- Count the complete normalized model request, including history and tool definitions. Summarize embedded data URLs before counting so base64 payload length is not mistaken for text tokens; mark multimedia-only totals as approximate.
- Token statistics must remain best-effort. A storage or callback failure must never fail the model request.
- Update `docs/token-usage.md`, `contexto/`, and focused normalization/storage/command tests whenever this accounting contract changes.

## Custom Provider Architecture

- The CLI owns persistent provider metadata and secrets in `cli/src/utils/custom-providers.ts`; the SDK must receive only the resolved active configuration.
- `providers.json` and `provider-auth.json` must remain separate. API keys entered through `/login` must stay masked and must never enter chat history, logs, analytics payloads, or terminal titles.
- An active custom provider is a global model override for the main agent and all subagents. `extractSubagentContextParams` must preserve `customProvider`; otherwise spawned agents silently fall back to the original backend. Switching provider/model must reset the cached CLI SDK client.
- `/agent` is the only public shortcut for the bundled generic auxiliary agent. It inserts `@Agent ` and must inherit the global provider/model selected through `/models`; do not add model names, a per-agent selector, or separate provider/model persistence. The stable bundled ID is `agent` and the display name is `Agent`.
- Direct-provider mode must not send Codebuff/OpenRouter-only request options or call Codebuff user validation, billing, remote agent lookup, or run persistence.
- Provider configuration is editor-only: `/login` opens the provider wizard and `/models` opens the grouped selector. Do not reintroduce standalone `codebuff provider` or `codebuff model` management commands.
- The full editor must remain reachable without prior credentials so a fresh installation can configure its first provider; Freebuff keeps its existing authentication/session gate and does not expose these flows.
- Preserve the original backend behavior when no custom provider is active.
- Update `docs/custom-providers.md` and `contexto/` when this architecture or its command surface changes.
- Every `RunState` returned by the SDK must be plain JSON data. Never retain live Zod/tool schema instances in `AgentState.toolDefinitions`; convert them to JSON Schema before storage and normalize the final `prompt-response` session at the SDK boundary so a later `previousRun` cannot fail on circular references.

## Context Compaction and Message Replay Safety

- `/compact` must remain a real registered CLI command and an implicit exact command. It sends the exact compact prompt, preserves history if the generated summary is empty, and must not run as an unknown slash command.
- Apply manual compaction only after the complete agent turn. The persisted state intentionally contains the summary as a user memory message and may contain no assistant message, so the command result must be built from the generated summary instead of calling generic last-message extraction. A successful compaction must never end as `No response from agent`.
- Base2 runs `context-pruner` before every step. Treat `maxContextLength` as the auto-compaction threshold, not the provider's absolute limit; calculate it as 90% of the selected model's `maxContextTokens`. Explicit/discovered model metadata overrides compatibility defaults.
- Manual provider model entries support `model-id=context-tokens`. Keep that value when editing providers and read common context-window fields from `/models` responses.
- Provider metadata is untrusted extension data. Never let it overwrite protocol fields such as `role`, `content`, `tool_calls`, `reasoning_content`, `tool_call_id`, content-part `type`, or tool-call `function`.
- Normalize persisted message history before replay. Repair legacy strings and nullable tool outputs, remove irrecoverable entries, and remove orphaned tool calls/results so one malformed historic message cannot poison every future turn.
- Update `docs/custom-providers.md`, `docs/chat-sessions.md`, focused compaction/message tests, and `contexto/` whenever these contracts change.

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

## Provider Management and Portable Sessions

- `/providers` is the interactive source of truth for listing, editing,
  activating, and deleting custom providers. `/login` remains the short path
  for adding one. Do not add standalone executable subcommands for provider
  administration.
- Editing a provider must preserve its stable internal ID. A blank API-key field
  preserves the current credential; `none` removes it. Provider metadata and
  authentication remain in separate files under `~/.codewolf`.
- An empty models field means discovery through the normalized `/models`
  endpoint. Manual comma/newline-separated model IDs remain supported. Reset
  the cached SDK client after any active provider or model change.
- `/rename` stores only a user-visible name in `chat-meta.json`; it must not
  change the chat ID. Later checkpoint writes must preserve that name and
  `/history` must search/display it.
- `/export` and `/import` use the versioned Codewolf JSONL archive defined in
  `cli/src/utils/chat-transfer.ts`. Exports contain session metadata, messages,
  and RunState, but never provider/search credentials or project files.
- Import must validate size and every record, preview metadata, require user
  confirmation, create a fresh chat ID, and never overwrite an existing chat.
  Keep quoted paths with spaces working on Windows and POSIX systems.
- When an imported RunState replaces the active store outside the send hook,
  synchronize the request reference so the next prompt continues the imported
  conversation rather than the previous one.
- Update `docs/chat-sessions.md`, `docs/custom-providers.md`, tests, and
  `contexto/` whenever these contracts change.
