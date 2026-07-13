# Freebuff

Freebuff is the public, free coding agent built from the Codebuff agent framework.

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
- An active custom provider is a global model override for the main agent and all subagents. Switching provider/model must reset the cached CLI SDK client.
- Direct-provider mode must not send Codebuff/OpenRouter-only request options or call Codebuff user validation, billing, remote agent lookup, or run persistence.
- Provider configuration is editor-only: `/login` opens the provider wizard and `/models` opens the grouped selector. Do not reintroduce standalone `codebuff provider` or `codebuff model` management commands.
- The full editor must remain reachable without prior credentials so a fresh installation can configure its first provider; Freebuff keeps its existing authentication/session gate and does not expose these flows.
- Preserve the original backend behavior when no custom provider is active.
- Update `docs/custom-providers.md` and `contexto/` when this architecture or its command surface changes.
- Every `RunState` returned by the SDK must be plain JSON data. Never retain live Zod/tool schema instances in `AgentState.toolDefinitions`; convert them to JSON Schema before storage and normalize the final `prompt-response` session at the SDK boundary so a later `previousRun` cannot fail on circular references.
