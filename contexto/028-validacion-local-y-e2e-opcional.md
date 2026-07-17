# 028 — Validación local y E2E opcional

# Fecha

2026-07-15

# Objetivo

Corregir los errores de TypeScript y evitar que `bun test` falle por pruebas o runners manuales que requieren credenciales del backend.

# Archivos importantes modificados

- `cli/src/components/build-mode-buttons.tsx`
- `cli/src/utils/__tests__/custom-providers.test.ts`
- `sdk/src/agents/load-agents.ts`
- `agents/e2e/*.e2e.test.ts`
- `agents/browser-use/browser-use.test.ts`
- `agents/librarian/librarian.test.ts`
- `packages/agent-runtime/src/__tests__/read-docs-tool.test.ts`
- `packages/agent-runtime/src/__tests__/web-search-tool.test.ts`
- `packages/code-map/__tests__/parse.test.ts`
- `bunfig.toml`

# Soluciones implementadas

- El botón de revisión del plan ya no devuelve el booleano de `dispatchEvent` desde `onClick`.
- El mock de `fetch` usa una conversión explícita compatible con Bun 1.3.14.
- Las E2E de agentes son opt-in mediante `RUN_CODEBUFF_E2E=true` y `CODEBUFF_API_KEY`.
- Los runners manuales de navegador y librería quedan fuera del descubrimiento normal de `bun test`.
- El cargador ignora módulos auxiliares sin tratarlos como agentes inválidos.
- Las pruebas antiguas apuntan a los investigadores y tipos que existen actualmente.
