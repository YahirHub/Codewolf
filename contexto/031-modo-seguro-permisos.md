# 031 — Modo seguro con permisos por operación

# Fecha

2026-07-15

# Objetivo

Agregar una protección opcional para revisar cada comando, mutación de archivos y herramienta externa antes de ejecutarla.

# Decisiones tomadas

- El Modo seguro se activa globalmente desde `/config` y permanece desactivado por defecto.
- Cada operación sensible exige una autorización nueva; no existe una opción de permitir durante toda la sesión.
- Las lecturas locales no requieren permiso.
- Los comandos escritos directamente por el usuario en modo Bash no se confirman dos veces.
- Las herramientas personalizadas y MCP se consideran sensibles porque Codewolf no puede garantizar sus efectos.
- Una denegación produce un par válido de llamada/resultado para que el modelo pueda continuar sin corromper el historial.
- Los permisos de subagentes pasan por la misma cola FIFO que el agente principal.

# Arquitectura actual

- `common/src/util/tool-permission.ts` clasifica la operación y construye una descripción segura.
- `packages/agent-runtime/src/tools/tool-executor.ts` intercepta la operación antes de emitirla o ejecutarla.
- El SDK transporta `requestToolPermission` hasta el agente principal y los subagentes.
- `cli/src/utils/tool-permission-bridge.ts` serializa solicitudes y las conecta con la TUI.
- `cli/src/components/tool-permission-screen.tsx` muestra los botones de permitir o rechazar.
- El mantenimiento automático de `contexto/` usa la misma autorización antes de escribir.

# Librerías usadas

- No se agregaron dependencias.

# Archivos importantes modificados

- common/src/types/tool-permission.ts
- common/src/util/tool-permission.ts
- packages/agent-runtime/src/tools/tool-executor.ts
- sdk/src/run.ts
- cli/src/components/config-screen.tsx
- cli/src/components/tool-permission-screen.tsx
- cli/src/utils/tool-permission-bridge.ts
- cli/src/hooks/use-send-message.ts
- cli/src/chat.tsx
- cli/src/components/status-bar.tsx

# Soluciones implementadas

- Autorización individual para comandos, creación, edición, eliminación, hooks y herramientas externas.
- Razón visible proporcionada por el modelo o fallback descriptivo.
- Vista previa con ocultación de claves, tokens, contraseñas y credenciales.
- Cola FIFO para operaciones simultáneas.
- Rechazo seguro al cancelar la ejecución o cerrar la interfaz.
- Indicador permanente `SEGURO` en la barra de estado.

# Pendientes

- Validar manualmente el flujo dentro de un servidor de pruebas antes de utilizarlo en producción.

# Próximos pasos

- Probar permisos de agente principal, subagentes, MCP, comandos y mantenimiento de contexto en Windows y Linux.
