# Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@codebuff/common/testing/mock-modules.ts` helpers for constants only.

CLI hook testing note: React 19 + Bun + RTL `renderHook()` is unreliable; prefer integration tests via components for hook behavior.

## CLI tmux Testing

For testing CLI behavior via tmux, use the helper scripts in `scripts/tmux/`. These handle bracketed paste mode and session logging automatically. Session data is saved to `debug/tmux-sessions/` in YAML format and can be viewed with `bun scripts/tmux/tmux-viewer/index.tsx`. See `scripts/tmux/README.md` for details.

Useful workflow for agents:

```bash
# Start the dev CLI in a detached tmux session.
SESSION=$(./scripts/tmux/tmux-cli.sh start --name cli-check -w 160 -h 40 --wait 6)

# Capture the initial screen. Captures are written to debug/tmux-sessions/$SESSION/.
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label initial

# Send a prompt. The helper uses bracketed paste so text is not dropped.
./scripts/tmux/tmux-cli.sh send "$SESSION" "Search for getAgentBaseName and report what you find" --wait-idle 4

# Capture after the run, then inspect the saved capture text.
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label after-search --wait 2

# Clean up when finished.
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

If a change can be verified with a small local harness instead of a live model-backed CLI run, run that harness inside tmux too. This still checks terminal rendering and produces a capture:

```bash
SESSION=$(./scripts/tmux/tmux-cli.sh start \
  --name render-check \
  -w 160 -h 20 \
  --wait 1 \
  --command "bun .context/my-render-check.tsx")

./scripts/tmux/tmux-cli.sh capture "$SESSION" --label rendered
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

When verifying UI output, prefer checking the saved capture file for concrete strings that should and should not appear. For example, after expanding a code-searcher agent, check that the capture shows the search summary but not raw structured payload keys like `results:` or `stdout:`.

## Local and live test separation

The default command is deterministic and must not require backend credentials:

```bash
bun test
```

Agent suites that call the live backend are opt-in. They are skipped unless
both `RUN_CODEBUFF_E2E=true` and `CODEBUFF_API_KEY` are present. In PowerShell:

```powershell
$env:RUN_CODEBUFF_E2E = "true"
$env:CODEBUFF_API_KEY = "<clave>"
bun test .\agents\e2e
```

The browser-use and librarian files are manual trace runners rather than Bun
unit-test suites, so the default test discovery excludes them. Run them
explicitly when needed:

```powershell
$env:RUN_CODEBUFF_E2E = "true"
$env:CODEBUFF_API_KEY = "<clave>"
bun .\agents\browser-use\browser-use.test.ts 0
bun .\agents\librarian\librarian.test.ts 0
```

Unset the temporary variables after the live run:

```powershell
Remove-Item Env:RUN_CODEBUFF_E2E -ErrorAction SilentlyContinue
Remove-Item Env:CODEBUFF_API_KEY -ErrorAction SilentlyContinue
```

## Cross-platform virtual filesystem paths

SDK and common tests frequently use virtual roots such as `/repo`, `/project`
or `/home/testuser`. These paths must preserve POSIX separators even when Bun
runs on Windows. Likewise, explicit Windows roots must retain Win32 semantics
on Linux or macOS.

Use `common/src/util/path-flavor.ts` for path operations that target an
injected `CodebuffFileSystem`. Host-native `node:path` remains appropriate for
real local paths created by the current process, but not for paths whose syntax
is supplied by an SDK caller or test fixture.

The default discovery exclusions are configured with `[test].pathIgnorePatterns`
in `bunfig.toml`. Integration tests that need Infisical, tmux, credentials or a
live backend must be executed explicitly rather than during `bun test`.

## Compatibilidad de la suite local en Windows

Las pruebas que necesitan lanzar otro proceso de Bun deben usar
`process.execPath`; no deben asumir que el comando `bun` está disponible en el
`PATH` heredado. Los fixtures con raíces POSIX como `/project` deben usar las
utilidades de `common/src/util/path-flavor.ts` en lugar de `node:path` nativo.

La configuración local de pruebas no carga Infisical ni el paquete histórico
`packages/internal`. `sdk/test/setup-env.ts` y `cli/src/__tests__/test-utils.ts`
proporcionan valores seguros y deterministas.

Las escrituras atómicas asíncronas al mismo archivo se serializan por destino.
Esto evita errores `EPERM` de `rename` en Windows y hace que la última
invocación sea el contenido final.
