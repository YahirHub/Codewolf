#!/usr/bin/env python3
"""Elimina archivos obsoletos del antiguo flujo GPT-5 Agent.

Ejecutar desde la raíz del monorepo Codewolf:
    python scripts/cleanup-agent-gpt5-obsoleto.py
"""

from __future__ import annotations

from pathlib import Path
import sys


OBSOLETE_PATHS = (
    Path("agents/general-agent/gpt-5-agent.ts"),
    Path("cli/src/components/agent-model-selector-screen.tsx"),
    Path("common/src/types/__tests__/custom-provider.test.ts"),
    Path("contexto/019-modelo-configurable-gpt5-agent.md"),
    Path("cli/src/agents/bundled-agents.generated.ts"),
)


def main() -> int:
    root = Path.cwd().resolve()
    if not (root / "package.json").is_file() or not (root / "agents").is_dir():
        print(
            "Error: ejecuta este script desde la raíz del proyecto Codewolf.",
            file=sys.stderr,
        )
        return 1

    removed = 0
    for relative_path in OBSOLETE_PATHS:
        target = root / relative_path
        if target.is_file() or target.is_symlink():
            target.unlink()
            removed += 1
            print(f"Eliminado: {relative_path.as_posix()}")
        else:
            print(f"No existe, se omite: {relative_path.as_posix()}")

    print(f"Limpieza terminada. Archivos eliminados: {removed}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
