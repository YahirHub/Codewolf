# 024 — Commits semánticos y compatibilidad de terminal/proveedores

# Fecha

2026-07-15

# Objetivo

Corregir los mensajes genéricos del commit automático y evitar que una ruta de Windows o una caída temporal del proveedor conviertan el resultado de terminal en un error engañoso.

# Decisiones tomadas

- El mensaje del commit debe describir el trabajo real antes de consultar al proveedor.
- El proveedor puede refinar el borrador, pero no es requisito para crear un commit verificado.
- `basher` debe ejecutar una sola operación de terminal y devolver su resultado sin otra llamada al modelo.
- La terminal mantiene Bash como contrato uniforme y normaliza únicamente wrappers de directorio que puede transformar con seguridad.
- Los gateways OpenAI-compatible deben aceptar formatos de error heterogéneos y reintentar fallos transitorios.

# Arquitectura actual

- `cli/src/utils/verified-commit.ts` obtiene tipos de cambio desde Git, lee títulos Markdown y crea un Summary/Description local.
- `cli/src/components/verified-commit-screen.tsx` puede confirmar el commit aunque el proveedor no esté disponible.
- `sdk/src/tools/run-terminal-command.ts` elimina un `cd` redundante y convierte rutas de Windows a Git Bash o WSL.
- `agents/basher.ts` devuelve directamente el resultado estructurado del proceso.
- `packages/llm-providers/src/openai-compatible/openai-compatible-error.ts` normaliza errores y decide reintentos.

# Librerías usadas

No se agregaron dependencias. Se reutilizan Node.js, Zod, Git y el runtime existente.

# Archivos importantes modificados

- `cli/src/utils/verified-commit.ts`
- `cli/src/components/verified-commit-screen.tsx`
- `cli/src/utils/__tests__/verified-commit.test.ts`
- `sdk/src/tools/run-terminal-command.ts`
- `common/src/tools/params/tool/run-terminal-command.ts`
- `sdk/src/__tests__/run-terminal-command.test.ts`
- `agents/basher.ts`
- `agents/__tests__/basher.test.ts`
- `packages/llm-providers/src/openai-compatible/openai-compatible-error.ts`
- `packages/llm-providers/src/openai-compatible/openai-compatible-error.test.ts`
- `agents/base2/base2.ts`

# Problemas encontrados

- `Guardar cambios verificados` era aceptado como Summary aunque no explicaba la implementación.
- La descripción podía ser solo una lista de rutas.
- Un comando generado en Windows repetía `cd C:\...` dentro de Bash y fallaba antes de ejecutar Git.
- `basher` solicitaba al proveedor resumir el resultado después de ejecutar la terminal. Si esa segunda petición fallaba, la UI mostraba `Error from provider` en vez del resultado real.
- Algunos gateways devolvían `Upstream request failed` con envolturas no idénticas al formato OpenAI y no siempre se trataba como transitorio.

# Soluciones implementadas

- Se agregó un generador semántico local basado en estado Git, archivos agregados/modificados/eliminados, títulos Markdown y solicitud original.
- Para cambios formados por `contexto/*.md` y memoria, el Summary es `Crear archivos de contexto del proyecto` o `Actualizar contexto persistente del proyecto`.
- Las respuestas genéricas, vacías, prohibidas o un fallo del proveedor utilizan el mensaje local.
- La terminal elimina un wrapper redundante al proyecto actual y convierte rutas distintas a `/c/...` o `/mnt/c/...` según el entorno.
- El resultado reporta `startingCwd`, `shell` y `executedCommand` cuando se normaliza.
- `basher` ya no genera un segundo paso LLM.
- Los errores OpenAI-compatible aceptan `error` como objeto o texto, `message` y `detail`; reintentan 408, 425, 429, 5xx y mensajes upstream transitorios, respetando `x-should-retry`.

# Pendientes

- Probar la ejecución empaquetada en Windows con Git Bash instalado y en WSL.
- Confirmar con varios proveedores que los reintentos no ocultan errores de validación permanentes.

# Próximos pasos

- Activar commits verificados en un proyecto de prueba.
- Crear y actualizar documentos de `contexto/`.
- Confirmar que el commit usa un Summary semántico y que no intenta ejecutar Git mediante `basher`.
- Simular una respuesta upstream temporal y verificar que se reintenta antes de informar el error final.
