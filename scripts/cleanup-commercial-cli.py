#!/usr/bin/env python3
"""Remove obsolete commercial CLI command files after copying an update ZIP.

The current usage.ts is a local token-statistics command and must be preserved.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OBSOLETE_FILES = (
    ROOT / "cli" / "src" / "commands" / "subscribe.ts",
)

removed = 0
for file_path in OBSOLETE_FILES:
    if file_path.exists():
        file_path.unlink()
        removed += 1
        print(f"Eliminado: {file_path.relative_to(ROOT)}")

if removed == 0:
    print("No había comandos comerciales obsoletos por eliminar.")
else:
    print(f"Limpieza terminada: {removed} archivo(s) eliminado(s).")
