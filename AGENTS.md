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
- `scripts/tmux/` - tmux helpers for CLI testing

## Conventions

- Use `bun install` and `bun run`.
- Prefer dependency injection over module mocking.
- Run interactive CLI tests in tmux.
- Keep `bun test` deterministic and credential-free. Live agent E2E suites require explicit `RUN_CODEBUFF_E2E=true` plus `CODEBUFF_API_KEY`; manual trace runners must not execute during default test discovery.
- File operations that receive an injected filesystem must choose path semantics from the supplied root/path. Do not use the host-native `path` implementation blindly for virtual POSIX paths on Windows or Windows paths on POSIX hosts; reuse `common/src/util/path-flavor.ts`.
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

## Local Token Usage Architecture

- `/usage` displays local technical token statistics only. It must not expose prices, credits, subscriptions, balances, or provider quota claims.
- Capture usage at the shared LLM boundary so the main agent, subagents, non-streaming calls, streaming calls, and structured calls use the same accounting path.
- Prefer input/output/total token values reported by the provider. If either side is missing, calculate the missing value locally and label the event `mixed`; if no values are reported, label it `local`. Never present a local estimate as provider-reported.
- Persist append-only numeric metadata in `~/.codewolf/usage.jsonl`. Never store prompts, responses, tool results, file contents, images, API keys, or authorization headers in usage records.
- Development and compiled binaries must share the same file. Retain at most 90 days and 10,000 events, compacting only when the file reaches the configured threshold.
- Count the complete normalized model request, including history and tool definitions. Summarize embedded data URLs before counting so base64 payload length is not mistaken for text tokens; mark multimedia-only totals as approximate.
- Token statistics must remain best-effort. A storage or callback failure must never fail the model request.
- Update `docs/token-usage.md`, `contexto/`, and focused normalization/storage/command tests whenever this accounting contract changes.
- The persistent status meter represents the main agent's current context window, not cumulative `/usage` totals. Read `SessionState.mainAgentState.contextTokenCount`, compare it with the active model's `maxContextTokens`, and render remaining capacity as a draining bar. In-flight snapshots may update the meter only while their chat is still active. Manual compaction must immediately recalculate the count from the compacted summary.

## Custom Provider Architecture

- The CLI owns persistent provider metadata and secrets in `cli/src/utils/custom-providers.ts`; the SDK must receive only the resolved active configuration.
- `providers.json` and `provider-auth.json` must remain separate. API keys entered through `/login` must stay masked and must never enter chat history, logs, analytics payloads, or terminal titles.
- An active custom provider is a global model override for the main agent and all subagents. `extractSubagentContextParams` must preserve `customProvider`; otherwise spawned agents silently fall back to the original backend. Switching provider/model must reset the cached CLI SDK client.
- `/agent` is the only public shortcut for the bundled generic auxiliary agent. It inserts `@Agent ` and must inherit the global provider/model selected through `/models`; do not add model names, a per-agent selector, or separate provider/model persistence. The stable bundled ID is `agent` and the display name is `Agent`.
- Direct-provider mode must not send Codebuff/OpenRouter-only request options or call Codebuff user validation, billing, remote agent lookup, or run persistence.
- Provider configuration is editor-only: `/login` opens the provider wizard and `/models` opens the grouped selector. Do not reintroduce standalone `codebuff provider` or `codebuff model` management commands.
- The full editor must remain reachable without prior credentials so a fresh installation can configure its first provider.
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
- `/history` opens the current-project history by default. `Tab` toggles a
  global view over every existing path remembered in `recent-projects.json`.
  Global rows must carry both `projectPath` and `chatId`; selecting one must
  switch the working directory, reset the SDK client, reload project agents,
  MCP configuration and skills, then resume the chat. Deletion must target the
  selected project's exact data directory.
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

## PLAN Mode and Rewind Checkpoints

- PLAN is selected through the agent-mode toggle. Do not reintroduce a standalone `/plan` slash command or a separate plan input mode.
- `base2-plan` must be read-only by capabilities, not just by prompt. It may inspect files, search, load skills, ask material questions, and spawn research/reasoning agents; it must not expose file mutation tools, terminal agents, todo-writing, editors, tmux, or the generic implementation agent.
- A completed plan must be grounded in inspected project context and include objective, verified context, decisions, numbered implementation steps, affected files, validation, risks/rollback, and a concise execution checklist. The plan card may be revised in PLAN or approved into DEFAULT, MAX, or LITE.
- Approved-plan prompts must tell the implementation mode to convert the plan into `write_todos` before editing and to stop for critical contradictions rather than silently changing scope.
- `/rewind` creates a checkpoint before each submitted user prompt and keeps the 100 most recent checkpoints per chat under `checkpoints/`.
- Observe built-in `write_file`, `str_replace`, and `apply_patch` at the SDK boundary. Snapshot the file before mutation and record the last known state afterward for main-agent and subagent edits alike. Callback/storage failures are best-effort and must never block or alter the editing tool result.
- Restoration supports conversation plus files, conversation only, and files only. Conversation restoration must put the selected original prompt back in the input and synchronize both the visible RunState and the send hook's imperative RunState reference before the user can submit again.
- Abort an active run before opening rewind and drain any queued persistence checkpoint before saving restored state, so an old asynchronous write cannot resurrect discarded future messages.
- Rewind only files changed by tracked structural editing tools. Never claim to restore Bash, scripts, MCP, Git, editor, or external-process mutations. If the current file differs from Codewolf's last known post-edit state, skip it instead of overwriting possible user work.
- Reject path traversal and symlink escapes outside the project root. Preserve content-addressed deduplication, atomic blob restoration, and garbage-collect unreferenced checkpoint objects after retention or conversation rewind.
- Per-chat checkpoint queues must return operation failures to their caller while keeping a rejection-safe internal tail. Never leave rejected bookkeeping promises unobserved, because they can terminate the CLI after the original error was already handled.
- `/rewind` is not a replacement for Git. Keep this limitation visible in the UI and in `docs/chat-sessions.md`.
- Update `contexto/`, `docs/agents-and-tools.md`, `docs/chat-sessions.md`, command tests, plan capability tests, and rewind storage tests whenever these contracts change.

## Optional Project Methodology and Verified Commits

- `/config` is the single interactive surface for `projectContextEnabled` and `verifiedCommitsEnabled`. Keep both options independent, globally persisted in `~/.codewolf/settings.json`, and disabled by default for backward compatibility.
- When project context is enabled, discover only Markdown files directly under `<project>/contexto`, order numeric prefixes first, and summarize them with the read-only structured agent in `cli/src/utils/project-context.ts`. The automatic read is capped at 200 files/320,000 bytes, must preserve prefix 000 and prioritize the newest records under that cap, and must calculate the next prefix from every filename to prevent collisions. Cache by a fingerprint that covers all names/metadata plus selected content under the project's Codewolf data directory; unchanged context must not trigger another model call.
- Inject the methodology and summary as additive virtual knowledge files. Never replace auto-discovered knowledge and never write the virtual `.codewolf/metodologia-desarrollo.md` or `.codewolf/contexto-resumen.md` paths into the user's repository.
- The main agent must inspect relevant source context before important changes. After every successful implementation with real file mutations, the CLI must guarantee that a numbered `contexto/*.md` record and `000-contexto-maestro.md` are created or updated. Routine records are generated deterministically and locally without an extra provider call; `/init` may use one structured enrichment call with a local fallback. Titles must be technical, no longer than 72 characters, and must never copy the request. Never paste the final answer, reasoning, tables, or tool output into context files. Omit optional sections when there is no confirmed information instead of writing filler. Context files must not contain credentials or secrets.
- With project context enabled, exact `/init` must create `contexto/` when absent and refresh the master plus a numbered initialization record after analyzing project documentation, manifests, structure, scripts and relevant code. It must not stop after creating `knowledge.md` or `.agents/`.
- When knowledge may be stale or insufficient—especially project structure, stack, APIs, versions, security, compatibility, or deployment—the base agent must use available search/research agents and prefer official primary sources instead of guessing.
- Verified commits start from a pre-turn Git porcelain baseline and may include successful structured mutations that were clean before their first eligible turn and still have a final Git change. Paths deferred through `No crear commit` are allowed to remain dirty in later baselines only while their persisted fingerprint still matches. Never silently include reverted/no-op paths, unrelated pre-existing dirty paths, staged work, unsafe terminal/script/MCP mutations, paths outside the active Git root, or files changed manually after verification.
- Pause the message queue while the verification screen is open. A commit requires the explicit `Funciona, crear commit` action. `Necesita correcciones` returns a prefilled correction prompt. `No crear commit` leaves disk and Git unchanged but persists the verified paths as a project backlog; later verified turns must accumulate every still-safe deferred path. Never push automatically.
- Generate Spanish Summary/Description without references to ChatGPT, OpenAI, assistants, or artificial intelligence. Stage only verified paths and unstage them best-effort if commit creation fails.
- Build a deterministic semantic commit draft before contacting any provider. Use Git change kinds, verified paths, Markdown headings, and the original request. Reject generic summaries such as `Guardar cambios verificados`; context-only changes must explicitly say that project context was created or updated. Provider refinement is optional and must fall back locally on empty, generic, or transiently failed responses.
- Verified-commit mode owns `git add` and `git commit`. The base agent and subagents must not retry those operations through terminal or basher after a provider error.
- `run_terminal_command` always uses Bash-compatible syntax from the selected cwd. Prefer relative paths, remove redundant project-root `cd` wrappers, normalize Windows paths only when Git Bash/WSL semantics are known, and expose `executedCommand`, `startingCwd`, and `shell` when relevant.
- `basher` must return the terminal result deterministically without a second LLM step. OpenAI-compatible error parsing must accept common gateway envelopes and mark transient upstream/rate-limit/5xx failures retryable while honoring explicit `x-should-retry` headers.
- Update `docs/project-methodology.md`, the bundled methodology document, focused tests, and `contexto/` whenever these contracts change.

## Cleanup boundary

- The `freebuff/` workspace and its CLI/session/ads/subscription/referral surfaces are obsolete and must not be reintroduced.
- `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, and the Apache attribution are still active compatibility or legal identifiers. Do not rename or remove them as cosmetic cleanup; require a separately planned migration with aliases and consumer tests.
- When a ZIP is overlaid on an older tree, use `scripts/cleanup-codewolf-obsolete.ps1` so files deleted by the archive replacement are also removed from disk.

## Local Test Portability

- `bun test` must run without Infisical, backend credentials, tmux, macOS clipboard access, or live browser runners. Keep those integrations opt-in or excluded by explicit directory patterns in `bunfig.toml`.
- Child-process tests that need Bun must launch `process.execPath`, never the bare `bun` command, so Windows installations without Bun in the inherited `PATH` remain valid.
- Tests using injected filesystems must preserve the path syntax supplied by the fixture. Use `common/src/util/path-flavor.ts` instead of host-native path operations for `/project`, Windows drive roots, or UNC roots.
- User-visible Spanish labels are the current contract. Do not keep tests expecting removed credit surfaces or stale English labels.
- Async atomic writes to the same target must stay serialized per path; a failed write must not poison later writes or leave an unhandled rejected cleanup promise.

## Safe Mode Permission Architecture

- `/config` owns the optional `safeModeEnabled` setting. It is disabled by default and stored in `~/.codewolf/settings.json`.
- When enabled, require a fresh user decision before every model-requested terminal command, built-in file mutation, project file-change hook, custom tool, Composio action, or MCP call. Local read-only tools remain automatic. Commands typed directly by the user in Bash mode are already explicit user actions and must not be double-confirmed.
- Perform the permission check in the shared runtime immediately before emitting or executing the tool call. Propagate the callback through the SDK and every subagent. Never implement protection only in the main-agent prompt.
- Denial must emit a valid tool-call/tool-result pair with `permissionDenied: true`; do not execute the handler and do not leave orphaned protocol messages. A callback failure or aborted run must fail closed.
- Serialize concurrent permission requests through the CLI FIFO bridge. Do not add an allow-for-session option: each sensitive operation must ask again.
- Permission dialogs must show the exact target or command, agent identity, and a concise reason. Redact likely secrets from previews of external tools. Tool schemas should encourage models to populate the optional `reason` field.
- Automatic `contexto/` maintenance is also a file mutation and must request authorization in Safe Mode. Explicit user actions such as verified-commit confirmation and `/rewind` restoration already have their own confirmation flow and must not be double-prompted.
- Keep `docs/safe-mode.md`, focused permission tests, and `contexto/` synchronized whenever this contract changes.
