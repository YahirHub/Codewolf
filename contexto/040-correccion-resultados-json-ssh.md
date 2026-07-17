# 040 — Corrección del contrato JSON de resultados SSH

# Fecha

2026-07-17

# Objetivo

Corregir el fallo de compilación de declaraciones TypeScript causado por resultados de `ssh_remote` tipados como `Record<string, unknown>` cuando el contrato común exige `JSONValue` serializable.

# Archivos importantes modificados

- `common/src/tools/params/tool/ssh-remote.ts`
- `sdk/src/tools/ssh-remote.ts`
- `sdk/src/tools/__tests__/ssh-remote.test.ts`

# Problema encontrado

- `jsonToolResultSchema` acepta únicamente esquemas cuyo valor de salida extienda `JSONValue`.
- El esquema `z.record(z.string(), z.unknown())` producía `Record<string, unknown>`, que no garantiza valores JSON válidos.
- El helper del SDK devolvía directamente ese mismo tipo en `ToolResultOutput.value`, donde TypeScript exige `JSONValue`.
- El error aparecía durante `dts-bundle-generator`, aunque el bundling ESM/CJS previo terminara correctamente.

# Soluciones implementadas

- El resultado de `ssh_remote` usa ahora `jsonObjectSchema`, el esquema recursivo oficial del proyecto para objetos JSON.
- El SDK normaliza cada objeto remoto mediante `normalizeJsonValue` antes de construir el resultado de herramienta.
- Los campos `undefined` se eliminan de forma segura y valores especiales compatibles con el normalizador no rompen la serialización.
- Se añadieron pruebas para validar objetos JSON anidados y la eliminación de un `connection_id` indefinido en respuestas de error.

# Validación realizada

- Comprobación aislada estricta de la frontera `JSONValue`: aprobada.
- Ejecución real de `normalizeJsonValue` con campos `undefined`: aprobada.
- Aserciones sobre los dos archivos modificados para impedir que reaparezcan `z.unknown()` o la devolución directa no normalizada: aprobadas.
- No fue posible ejecutar `bun run build:binary` en este entorno porque Bun y las dependencias del monorepo no están instalados y el entorno no permite descargarlos.

# Comandos de validación pendientes en Windows

```powershell
bun install --frozen-lockfile
bun run build:sdk
bun run build:binary
bun run tests
```

# Riesgos

- La normalización JSON elimina propiedades con valor `undefined`, comportamiento equivalente a `JSON.stringify` y esperado por el contrato de herramientas.
- No cambia la funcionalidad SSH ni las políticas de permisos; solo corrige la frontera de serialización y tipos.
