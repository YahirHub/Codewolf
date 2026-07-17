# 029 — Corregir rutas virtuales y suite portable

# Fecha

2026-07-15

# Objetivo

Hacer que las herramientas de archivos y la suite local funcionen igual en Windows, Linux y sistemas de archivos virtuales.

# Decisiones tomadas

- La sintaxis de una ruta se determina por la raíz recibida, no por el sistema operativo que ejecuta Codewolf.
- Las rutas POSIX simuladas conservan `/` aunque las pruebas se ejecuten en Windows.
- Las rutas de Windows conservan unidades, barras invertidas y rutas UNC aunque el proceso se ejecute en otro sistema.
- Las pruebas que requieren Infisical, terminal interactiva o servicios reales quedan fuera de `bun test` mediante la configuración oficial de Bun.

# Archivos importantes modificados

- common/src/util/path-flavor.ts
- common/src/project-file-tree.ts
- sdk/src/tools/path-utils.ts
- sdk/src/tools/change-file.ts
- sdk/src/tools/apply-patch.ts
- sdk/src/tools/code-search.ts
- sdk/src/run-state.ts
- bunfig.toml
- bun.lock

# Problemas encontrados

- En Windows, `path.resolve` y `path.join` convertían rutas virtuales como `/repo/src/file.ts` en rutas del host como `C:\\repo\\src\\file.ts`.
- El valor `exclude` de `bunfig.toml` no estaba excluyendo las integraciones durante el descubrimiento normal.
- Dos suites E2E invocaban `liveDescribe` antes de declararlo.
- El lockfile conservaba paquetes retirados durante la limpieza de Freebuff y no coincidía con los manifiestos actuales.

# Soluciones implementadas

- Se agregó una utilidad compartida que selecciona `path.posix`, `path.win32` o la sintaxis nativa según la ruta suministrada.
- Lectura, escritura, parches, búsqueda, filtros, contexto del usuario y árbol de archivos reutilizan esa resolución.
- `bunfig.toml` usa `pathIgnorePatterns` para separar las pruebas locales de integraciones con entorno externo.
- Las declaraciones de control E2E se colocaron antes de las suites que las utilizan.
- `bun.lock` se sincronizó con los workspaces y dependencias vigentes.

# Pendientes

- Ejecutar `bun install --frozen-lockfile` y `bun test` en Windows para confirmar la suite completa con Bun 1.3.14.
