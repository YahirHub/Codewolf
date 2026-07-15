# Contributing to Codewolf

Codewolf is a Bun/TypeScript monorepo. Contributions should stay focused, tested, and compatible with the terminal client and SDK.

## Main workspaces

- `cli/` — OpenTUI terminal client
- `sdk/` — JavaScript/TypeScript SDK
- `common/` — shared schemas, types, and utilities
- `agents/` — bundled agent definitions
- `packages/agent-runtime/` — agent execution and tool handlers
- `packages/code-map/` — source parsing helpers
- `packages/llm-providers/` — provider adapters
- `evals/` — evaluation suites
- `scripts/tmux/` — interactive terminal test helpers

Do not commit credentials, private deployment configuration, generated build output, or local usage/session data.

## Development

Install dependencies:

```bash
bun install
```

Run the main validations:

```bash
bun run build:sdk
bun run build:binary
bun test
```

For interactive terminal behavior, use the tmux helpers documented in `docs/testing.md`.

## Pull requests

1. Keep the change scoped to one concern.
2. Add or update focused tests for non-trivial behavior.
3. Update `contexto/` and public documentation when architecture or behavior changes.
4. Describe manual verification steps and any known limitation.
5. Do not mix unrelated formatting or generated files into the patch.
