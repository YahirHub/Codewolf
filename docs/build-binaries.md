# Building Codewolf binaries

## Local build

From the repository root:

```bash
bun install --frozen-lockfile
bun run build:binary
```

The current operating system determines the output:

- Windows: `cli/bin/codewolf.exe`
- Linux/macOS: `cli/bin/codewolf`
- Required companion asset: `cli/bin/tree-sitter.wasm`

Keep `tree-sitter.wasm` in the same directory as the executable.

## GitHub Actions

The workflow is stored at:

```text
.github/workflows/build-binaries.yml
```

It runs only in either of these cases:

1. Manually from **Actions → Build Codewolf binaries → Run workflow**.
2. When a tag whose name starts with `v` is pushed, such as `v1.0.0`.

A manual run may provide a version. If it is left empty, the version from the root `package.json` is used. A tag run uses the tag without its leading `v`.

## Generated artifact

The workflow uploads a single artifact containing:

```text
codewolf-linux-x64.tar
codewolf-windows-x64.zip
SHA256SUMS.txt
```

The Linux TAR preserves the executable permission. The Windows ZIP stores `codewolf.exe` and `tree-sitter.wasm` without an additional compression pass.

## Runner usage

The workflow intentionally uses one `ubuntu-latest` job:

- Dependencies are installed once.
- Bundled agents and SDK assets are generated once.
- Linux is compiled natively.
- Windows x64 is cross-compiled with Bun.
- Repeated runs for the same ref are cancelled.
- Artifacts are retained for seven days.
- Binary artifacts are uploaded with compression disabled to reduce runner CPU time.
