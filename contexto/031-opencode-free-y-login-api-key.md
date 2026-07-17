# 031 — Integrar OpenCode Free y autenticación por API key

# Fecha

2026-07-15

# Objetivo

Incorporar temporalmente OpenCode Free sin credenciales y ampliar `/login` con una selección de método de autenticación que permita configurar OpenCode Go mediante API key.

# Decisiones tomadas

- OpenCode Free es un proveedor integrado de solo lectura y no se guarda como definición editable.
- Solo se aceptan modelos cuyo identificador termina exactamente en `-free`.
- La API key de OpenCode Go se almacena únicamente en `provider-auth.json`.
- La opción de suscripción se muestra en `/login`, pero permanece deshabilitada hasta contar con una implementación real.
- La integración se concentra en dos módulos para poder retirarla sin alterar el sistema genérico de proveedores.

# Arquitectura actual

- `opencode-catalog.ts` contiene IDs, endpoints, fallback y caché del catálogo gratuito.
- `opencode-providers.ts` realiza descubrimiento de modelos y configuración de OpenCode Go.
- `loadAvailableProvidersConfig()` combina el catálogo gratuito con proveedores persistidos sin escribirlo en `providers.json`.
- El catálogo se actualiza al iniciar el chat y al abrir `/models`.

# Librerías usadas

- APIs estándar de Node.js y `fetch` existente.
- No se agregaron dependencias.

# Archivos importantes modificados

- `cli/src/providers/opencode-catalog.ts`
- `cli/src/utils/opencode-providers.ts`
- `cli/src/utils/custom-providers.ts`
- `cli/src/components/provider-auth-flow-screen.tsx`
- `cli/src/components/model-selector-screen.tsx`
- `cli/src/components/provider-manager-screen.tsx`
- `cli/src/chat.tsx`

# Problemas encontrados

- El catálogo gratuito cambia con el tiempo, por lo que una lista fija no es suficiente.
- OpenCode Free y OpenCode Go usan rutas y requisitos de autenticación diferentes.

# Soluciones implementadas

- Consulta dinámica de `https://opencode.ai/zen/v1/models` sin cabecera de autorización.
- Filtrado estricto por sufijo `-free`, caché local y lista de respaldo.
- Proveedor gratuito activo por defecto únicamente en instalaciones sin configuración previa.
- Flujo `/login` con selección de método, OpenCode Go y asistente OpenAI-compatible general.
- Consulta de modelos Go desde `https://opencode.ai/zen/go/v1/models` con Bearer token.
- OpenCode Free visible en `/models` y excluido del administrador editable `/providers`.

# Pendientes

- Implementar el método de suscripción únicamente cuando exista un contrato de autenticación definido.
- Retirar la integración temporal de OpenCode cuando deje de ser necesaria, siguiendo los puntos aislados documentados en `AGENTS.md`.

# Próximos pasos

- Validar en Windows la consulta de ambos catálogos y una solicitud real con cada tipo de proveedor.
