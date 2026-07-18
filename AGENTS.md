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
- `docs/safe-mode.md`
- `docs/ssh-remote.md`

## Persistent Project Context

- `contexto/000-contexto-maestro.md` is the mandatory entry point when resuming from a ZIP or a fresh session. Read it, then `README.md`, `AGENTS.md`, and the remaining numbered context files in order before substantial changes.
- Every architecture change, feature, important bug, security decision, build change, or deployment decision must create the next numbered file in `contexto/` with date, objective, decisions, architecture, libraries, files, problems, solutions, pending work, and next steps.
- When code and an older context file disagree, verify the code and update the newest context document instead of silently trusting stale notes.

## Custom Edition Without Monetization

- Codewolf does not sell or manage its own subscription and does not expose ads, credits, purchase links, or commercial rate-limit dialogs. Connecting an existing external ChatGPT/Codex subscription through `/login` is allowed. Do not register `/subscribe`, `/ads:enable`, `/ads:disable`, or aliases such as `/strong`, `/sub`, `/buy-credits`, and `/credits`. `/usage` is reserved exclusively for local technical token statistics and must never query billing, balances, quotas, or prices.
- The chat must not query billing/credit endpoints, request ads, display purchase counters, or replace the editor with a purchase banner. OAuth authentication and token refresh for an explicitly selected external provider are allowed; provider errors stay ordinary actionable errors.

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
- Normal interactive connectivity must probe public Internet independently of both Codebuff and the selected provider. Queue AI prompts while truly offline and resume interrupted provider requests/agent steps only after independent probes confirm Internet restoration. Provider HTTP errors, rate limits, authentication failures, and endpoint-specific outages must remain provider errors and must never trigger indefinite offline waiting.
- Agent validation and context token accounting are local-only in normal Codewolf execution. Active documentation lookup goes directly to Context7; do not reintroduce automatic Codebuff healthchecks, remote validation, remote token counting, Gravity Index calls, or hidden log shipping.
- Provider configuration is editor-only: `/login` opens the provider wizard and `/models` opens the grouped selector. Do not reintroduce standalone `codebuff provider` or `codebuff model` management commands.
- The full editor must remain reachable without prior credentials so a fresh installation can configure its first provider.
- Never fall back to the historical Codebuff backend when no direct provider is active. Require the user to configure/select a provider through `/login` and `/models`.
- Update `docs/custom-providers.md` and `contexto/` when this architecture or its command surface changes.
- Every `RunState` returned by the SDK must be plain JSON data. Never retain live Zod/tool schema instances in `AgentState.toolDefinitions`; convert them to JSON Schema before storage and normalize the final `prompt-response` session at the SDK boundary so a later `previousRun` cannot fail on circular references.

## Context Compaction and Message Replay Safety

- `/compact` must remain a real registered CLI command and an implicit exact command. It sends the exact compact prompt, preserves history if the generated summary is empty, and must not run as an unknown slash command.
- Apply manual compaction only after the complete agent turn. The persisted state intentionally contains the summary as a user memory message and may contain no assistant message, so the command result must be built from the generated summary instead of calling generic last-message extraction. A successful compaction must never end as `No response from agent`.
- Base2 runs `context-pruner` before every step. Treat `maxContextLength` as the auto-compaction threshold, not the provider's absolute limit; calculate it as 90% of the selected model's `maxContextTokens`. Explicit/discovered model metadata overrides compatibility defaults.
- Manual provider model entries support `model-id=context-tokens`. Keep that value when editing providers and read common context-window fields from `/models` responses.
- Provider metadata is untrusted extension data. Never let it overwrite protocol fields such as `role`, `content`, `tool_calls`, `reasoning_content`, `tool_call_id`, content-part `type`, or tool-call `function`.
- Normalize persisted message history before replay. Repair legacy strings and nullable tool outputs, remove irrecoverable entries, and remove orphaned tool calls/results so one malformed historic message cannot poison every future turn.
- Custom OpenAI-compatible providers must replay assistant tool-call/reasoning-only messages with a non-empty string `content`. Some gateways such as CommandCode coerce `""` to `null` and then reject their own normalized request; use the strict compatibility option only on direct custom-provider adapters so the original backend protocol remains unchanged.
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

## Persistent SSH Tool and Security Boundaries

- `ssh_remote` is an internal agent capability, not a direct user-facing terminal feature. Its schema lives in `common`, its client handler in `agent-runtime`, and persistent connection state in `sdk/src/tools/ssh-remote.ts`.
- Keep one process-wide in-memory manager for the active Codewolf CLI. A connection ID must remain reusable across tool calls and project-directory changes, support multiple servers simultaneously, and be removable with `close` or `close_all`. Resolve local transfer/key paths against the project root of the current call. Active sockets, shells, passwords, passphrases, and private-key contents never persist to disk.
- Configured SSH servers live globally in `~/.codewolf/ssh-servers.json`; encrypted passwords and key passphrases live in the portable `~/.codewolf/ssh-secrets.enc` vault. Both remain available across projects and CLI restarts. `list_servers` is the authoritative discovery action; agents must never scrape Codewolf directories to discover configured hosts. Keep server and vault actions explicit and deterministic.
- Secret prompts must keep their latest input in synchronous refs as well as React state. Enter or paste can arrive before the next render, so password confirmation must never compare render-stale values. Reset both refs and visual state between requests and after submission.
- Persist only non-secret connection metadata and authentication references such as `password_env`, `passphrase_env`, `private_key_path`, `agent`, or `agent_env`. Direct `connect` remembers the non-secret server profile by default unless `save_server=false`. A missing custom name must display exactly the host; legacy `label` values remain accepted and migrate to `name`.
- PLAN agents must not receive SSH capabilities. Implementation agents may use SSH only through `ssh_remote`; do not emulate persistent remote sessions with repeated local `ssh` subprocesses.
- `/config` exposes independent local safe mode, SSH safe mode, and `.env` protection. SSH registry listing/inspection plus remote read/navigation remain permission-free, while connecting, changing saved server profiles, command execution, shell writes, transfers, and remote mutations require per-operation approval when SSH safe mode is enabled.
- `.env` protection is independent of both safe modes and defaults to enabled. Metadata-only operations must not prompt, but any local, remote, command, search, transfer, or external-tool path that can expose protected contents must fail closed until approved. When an operation both acts remotely and exposes a protected `.env`, require both approvals instead of allowing one to replace the other. Template files such as `.env.example` remain readable.
- Permission previews must redact passwords, tokens, API keys, private keys, cookies, and credentials. Permission metadata must preserve the requesting agent/subagent identity.
- Persistent SSH passwords/passphrases must use the encrypted vault or external references (`password_env`, `passphrase_env`, `private_key_path`, SSH agent). The CLI—not the agent—owns masked secret input. Never place master passwords or prompted SSH credentials in prompts, tool results, permissions, logs, profiles, or telemetry. Support optional SHA-256 host fingerprint verification.
- Keep `ssh2` compatible with Bun compile targets. New SSH behavior needs deterministic credential-free tests; real-server tests remain explicit manual/integration checks.
- Fields shared by multiple SSH actions must not use Zod defaults when validation needs to distinguish omitted values from values explicitly sent by the agent. Apply defaults such as port 22 in the runtime/store boundary instead.

## Cleanup boundary

- The `freebuff/` workspace and its CLI/session/ads/subscription/referral surfaces are obsolete and must not be reintroduced.
- `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, and the Apache attribution are still active compatibility or legal identifiers. Do not rename or remove them as cosmetic cleanup; require a separately planned migration with aliases and consumer tests.
- When a ZIP is overlaid on an older tree, use `scripts/cleanup-codewolf-obsolete.ps1` so files deleted by the archive replacement are also removed from disk.

## Local Test Portability

- `bun test` must run without Infisical, backend credentials, tmux, macOS clipboard access, or live browser runners. Keep those integrations opt-in or excluded by explicit directory patterns in `bunfig.toml`.
- Child-process tests that need Bun must launch `process.execPath`, never the bare `bun` command, so Windows installations without Bun in the inherited `PATH` remain valid.
- Tests using injected filesystems must preserve the path syntax supplied by the fixture. Use `common/src/util/path-flavor.ts` instead of host-native path operations for `/project`, Windows drive roots, or UNC roots.
- Connectivity unit tests must never depend on the machine or CI having Internet. Mock the public connectivity probes explicitly and test offline recovery separately from provider/API failures.
- Disabling the active provider leaves an explicit no-provider state. ChatGPT/Codex rate-limit or credential failures must remain explicit and must never fall back to the historical Codebuff backend in any cost mode.
- User-visible Spanish labels are the current contract. Do not keep tests expecting removed credit surfaces or stale English labels.
- Async atomic writes to the same target must stay serialized per path; a failed write must not poison later writes or leave an unhandled rejected cleanup promise.
- Unit tests for pure utilities must not register unrelated global `mock.module` hooks. Prefer direct injected fixtures such as `testLogger`; unnecessary global mocks can collide across the full Bun suite and surface as `(unnamed)` hook failures.

## Temporary bundled OpenCode providers

- `cli/src/providers/opencode-catalog.ts` is the single catalog/constant boundary for the temporary OpenCode integration. Keep endpoint URLs, provider IDs, fallback free models, the `-free` filter, and the public model cache there.
- `cli/src/utils/opencode-providers.ts` owns network refresh and OpenCode Go configuration. Generic OpenAI-compatible provider logic must remain in `custom-providers.ts`.
- `opencode-free` is read-only and ephemeral: include it in available providers and `/models`, but never persist its provider definition or an API key. Requests to its `/models` endpoint must not include `Authorization`.
- On a fresh config, OpenCode Free may be the default. Once `providers.json` exists with no active provider, preserve that explicit no-provider state rather than reactivating OpenCode Free or falling back to the historical Codebuff backend.
- Only IDs ending exactly in `-free` belong to OpenCode Free. If discovery fails, retain the cache or embedded fallback instead of removing the provider.
- `opencode-go` is a normal persisted provider with a secret stored only in `provider-auth.json`. Its base URL and model endpoint are fixed to the official Go service.
- `/login` first selects the authentication method. The subscription path currently offers ChatGPT Plus/Pro (Codex Subscription); API-key login offers OpenCode Go, NVIDIA NIM, and the generic provider wizard.
- `/providers` manages persisted providers only. OpenCode Free is selected from `/models` and must not be editable or deletable there.
- To remove the temporary integration later, delete the two OpenCode modules, remove the available-provider merge/background refresh/login option, and keep the generic provider APIs unchanged.

## NVIDIA NIM provider

- `cli/src/providers/nvidia-nim-catalog.ts` owns NVIDIA provider constants, current model metadata, ID aliases, and the filter that excludes obvious embedding, OCR, image-generation, speech, safety, and other non-chat endpoints.
- `cli/src/utils/nvidia-nim-provider.ts` owns API-key persistence, public `/v1/models` discovery, configuration, and refresh. A successful NVIDIA catalog response is authoritative; do not re-add a model that NVIDIA removed merely because it remains in static metadata.
- NVIDIA NIM is persisted like a normal authenticated provider and appears in `/providers` after `/login`. Its key must remain masked, stored only in `provider-auth.json`, and must not be sent to the public `/v1/models` catalog.
- NVIDIA must keep `useNonStreaming: true`. The OpenAI-compatible model adapter performs a JSON completion and converts it into standard stream events because some NVIDIA SSE responses end without a final `finish_reason`, especially around tools.
- Opening `/models` and starting the editor refresh all dynamic provider catalogs through `cli/src/utils/provider-catalogs.ts`. Catalog failures are non-fatal and must preserve the last stored list.
- Current metadata should be reviewed against official NVIDIA model pages before changing IDs or context windows. Do not restore deprecated aliases as primary selectable models.

## ChatGPT/Codex subscription provider

- `common/src/constants/chatgpt-oauth.ts` is the shared boundary for OAuth endpoints, the reserved `openai-codex` provider ID, direct model aliases, and the current bundled Codex model IDs.
- `/login` must offer both device-code authentication and the localhost PKCE browser callback. Device code is the recommended path for SSH, containers, and headless terminals; show the verification URL and one-time code and poll until completion or cancellation.
- Store access and refresh tokens only in `~/.codewolf/credentials.json`. Preserve unrelated credentials in that file and enforce mode `0600` plus directory mode `0700` where POSIX permissions are supported. Never place OAuth tokens in `providers.json`, `provider-auth.json`, prompts, transcripts, logs, or terminal titles.
- The bundled provider is visible in `/models` only when OAuth credentials exist. It is read-only, must not be persisted as a provider definition, edited, or deleted from `/providers`, and its reserved ID must be rejected by the generic provider wizard.
- Selecting `openai-codex` must route through the ChatGPT Codex Responses endpoint with the OAuth bearer token and account header. Never treat it as a generic OpenAI-compatible API-key provider and never silently fall back to the Codewolf backend when credentials are missing, invalid, or rate-limited.
- Refresh expired access tokens with the stored refresh token using form-encoded OAuth requests. Authentication failures must direct the user back to `/login` without exposing response bodies or tokens.
- Keep the selectable catalog aligned with current official Codex model documentation. The account/workspace is authoritative for actual availability; do not infer entitlement from the presence of stored credentials.

## First-run onboarding and release distribution

- A genuinely new installation must show `FirstRunOnboardingScreen` before the project picker or chat. It must state that Codewolf is maintained by `https://github.com/YahirHub`, is based on `https://github.com/CodebuffAI/codebuff`, and preserves the Apache-2.0 `LICENSE` and `NOTICE` files.
- Capture the onboarding decision before `initializeApp()`, analytics, recent-project persistence, dynamic catalog refreshes, or any other startup write. Files created by the current process must never make a fresh installation look like an upgrade. Keep `codewolf --onboarding` available as a non-destructive way to reopen the flow.
- The onboarding offers exactly three starting paths: subscription login, a custom OpenAI-compatible provider, or OpenCode Free. Choosing OpenCode Free must explicitly persist it as the active provider. Completing any path stores the current onboarding version in `~/.codewolf/settings.json`.
- Keep onboarding branding responsive through `AnimatedCodewolfLogo`: wide terminals use the animated ASCII mark and short/narrow terminals use the animated `CODEWOLF` wordmark. Reuse this component instead of duplicating sheen/logo setup, and keep the option cards usable in a standard 80x24 terminal.
- Upgrades from versions that predate onboarding must not interrupt established users. Detect existing providers, credentials, search configuration, usage/history files, or project sessions and silently mark onboarding complete without changing the active provider.
- `install.sh` is the supported release installer/updater for Linux, macOS, and Bash-compatible Windows environments. Keep deterministic asset names aligned with `.github/workflows/build-binaries.yml`, verify `SHA256SUMS.txt`, install `tree-sitter.wasm` beside the executable, and back up `~/.codewolf` before every detected update.
- Release archives must contain the executable, `tree-sitter.wasm`, `LICENSE`, `NOTICE`, and `README.md`. Do not remove upstream notices or describe Codewolf as the original Codebuff project.
- The release workflow remains manual-only, uses numeric tags without `v`, and builds Linux glibc/musl, macOS, and Windows for supported x64/ARM64 targets. Retain baseline x64 variants for CPUs without AVX2.

## GitZip internal deployment tool

- `gitzip` is the single native boundary for gitignore-aware project packaging. Keep local archive creation, SSH upload, remote manifest creation, and remote extraction in this tool rather than teaching agents to approximate the workflow with broad terminal commands.
- Root and nested `.gitignore` rules are authoritative. Also honor `.codewolfignore` and legacy ignore filenames, always exclude `.git/` and the active output/temp files, and preserve empty directories and symlinks where supported.
- Protected `.env` files are excluded by default. Explicit inclusion must require the dedicated environment-file permission in addition to local or SSH Safe Mode. Never expose their contents in archive metadata or tool output.
- Remote archives must be produced from an explicit filtered manifest. Do not pass the source directory recursively to `tar` or `zip`, and do not permit advanced arguments to replace the manifest, add arbitrary files, trigger recursion, or execute helper commands.
- `create` is a local mutation; `upload`, `remote_create`, and `remote_extract` are SSH-sensitive operations. PLAN must remain incapable of calling `gitzip`.
- Keep local ZIP/TAR/TAR.GZ generation compatible with Bun-compiled Windows, Linux, and macOS binaries. Remote `tar`/`zip` availability is a runtime server requirement and errors must be explicit.

- Windows binary builds must compile to a unique staging executable before replacing `cli/bin/codewolf.exe`. If the canonical executable is locked (`EPERM`, `EACCES`, or `EBUSY`), preserve the successful build as `codewolf.next.exe` (or a timestamped equivalent), report it clearly, and do not kill user processes. A later build may promote normally after the active CLI closes.

## Bun fetch mocks

- Current Bun typings add static members such as `preconnect` to `typeof fetch`. Test-only async function mocks therefore do not structurally satisfy the complete `fetch` type.
- When a unit test intentionally replaces `globalThis.fetch` or passes a callable mock where `typeof fetch` is required, use an explicit `as unknown as typeof fetch` test boundary rather than weakening production fetch types or adding fake runtime behavior.
- Instalador npm GitHub: no usar lifecycle `postinstall`; el launcher `codewolf` descarga/verifica el runtime de GitHub Releases en la primera ejecución para evitar `uv_cwd` durante preparación Git de npm.
