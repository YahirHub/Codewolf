# Fecha

2026-07-13

# Objetivo

Agregar administración interactiva completa de proveedores personalizados,
renombrado visible de sesiones y exportación/importación portable de chats,
tomando como referencia los flujos del proyecto `coding-agent` sin copiar su
arquitectura ni abandonar la persistencia propia de Codewolf.

# Decisiones tomadas

- `/providers` es el único administrador general de proveedores dentro del
  editor. No se agregan subcomandos externos del ejecutable.
- `/login` se conserva como acceso rápido para agregar un proveedor nuevo.
- La edición conserva el identificador interno del proveedor aunque cambie su
  nombre visible.
- Una credencial vacía al editar conserva la actual; `none` la elimina.
- Los modelos pueden escribirse separados por comas o líneas. Si el campo queda
  vacío, Codewolf consulta `GET <baseUrl>/models` con la credencial disponible.
- `/rename` abre una pantalla interactiva; `/rename <nombre>` también está
  disponible para uso directo.
- El nombre de sesión vive en `chat-meta.json` y se preserva en checkpoints
  posteriores.
- `/export` y `/import` usan un formato JSONL portable de Codewolf. La
  importación crea una sesión nueva y nunca sobrescribe una existente.
- La transferencia incluye mensajes, estado del agente y metadatos de sesión,
  no copia credenciales persistentes ni archivos externos; el contenido ya presente en mensajes y resultados de herramientas sí forma parte del archivo y debe tratarse como sensible.
- Se admiten rutas entre comillas y se mantiene lectura compatible con el
  formato JSON único usado durante el desarrollo de esta función.

# Arquitectura actual

## Proveedores

```text
/providers
  -> ProviderManagerScreen
     -> lista providers.json + estado provider-auth.json
     -> ProviderLoginScreen para agregar/editar
     -> custom-providers.ts para persistencia atómica
     -> resetCodebuffClient al cambiar configuración activa
```

La metadata continúa en `~/.codewolf/providers.json` y las claves en
`~/.codewolf/provider-auth.json`.

## Nombres de sesión

```text
/rename
  -> SessionRenameScreen
  -> session-name.ts
  -> chat-meta.ts
  -> chat-meta.json:name
  -> /history muestra name antes del primer prompt
```

## Transferencia de chats

```text
/export
  -> ChatTransferScreen
  -> chat-transfer.ts
  -> codewolf-chat-<fecha>.jsonl

/import
  -> validación + vista previa + confirmación
  -> nuevo chat id imported-...
  -> chat-messages.json + run-state.json + chat-meta.json
  -> actualización inmediata de la TUI y RunState activo
```

El JSONL contiene una cabecera `codewolf_chat`, registros `message` y un
registro final `run_state`.

# Librerías usadas

No se agregaron dependencias. Se reutilizan:

- Node/Bun `fs`, `path` y `crypto`.
- Zod para validar importaciones.
- React y OpenTUI para las pantallas interactivas.
- Utilidades existentes de escritura atómica y normalización JSON segura.

# Archivos importantes modificados

- `cli/src/utils/custom-providers.ts`
- `cli/src/components/provider-login-screen.tsx`
- `cli/src/components/provider-manager-screen.tsx`
- `cli/src/commands/provider.ts`
- `cli/src/utils/chat-meta.ts`
- `cli/src/utils/session-name.ts`
- `cli/src/components/session-rename-screen.tsx`
- `cli/src/utils/chat-transfer.ts`
- `cli/src/components/chat-transfer-screen.tsx`
- `cli/src/commands/session.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/chat.tsx`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/utils/chat-history.ts`
- `cli/src/components/chat-history-screen.tsx`
- `docs/custom-providers.md`
- `docs/chat-sessions.md`
- `README.md`
- `AGENTS.md`
- `.gitignore`

# Problemas encontrados

- `/login` solo permitía agregar/reemplazar por nombre, pero no existía una
  vista para revisar, editar, activar o eliminar todos los proveedores.
- Cambiar modelos manualmente requería recrear el proveedor.
- El historial solo identificaba chats por el primer prompt.
- No existía un formato portable para mover una conversación con su RunState.
- Las rutas con espacios podían llegar con comillas desde el comando.
- Reemplazar el RunState desde `/import` fuera del hook de envío requería
  sincronizar la referencia usada por la siguiente solicitud.

# Soluciones implementadas

- Administrador `/providers` con lista, estados, acciones y confirmación de
  eliminación.
- Asistente de proveedor reutilizable en modo creación y edición.
- Persistencia estable del nombre de sesión, presentación en `/history` y conservación del título personalizado al enviar mensajes posteriores.
- Exportación JSONL con serialización segura para ciclos y `bigint`.
- Importación con límite de 200 MiB, validación por registro, vista previa y
  creación de una sesión nueva.
- Sincronización del RunState externo en `useSendMessage` para continuar el chat
  importado en la siguiente solicitud.
- Pruebas enfocadas para edición de proveedores, credenciales, nombres,
  rutas entre comillas y round trip de exportación/importación.

# Pendientes

- Ejecutar la suite completa en Windows y Linux con Bun `1.3.14`.
- Evaluar exportación HTML de solo lectura como función separada; no debe
  reemplazar el formato portable JSONL.
- Considerar acciones de renombrado y exportación directamente desde
  `/history` si el uso real demuestra que aportan valor.
- Diseñar una migración explícita si en el futuro cambia la versión del archivo
  portable.

# Próximos pasos

1. Probar agregar y editar proveedores con modelos manuales y por `/models`.
2. Renombrar una sesión, reiniciar y confirmar el nombre en `/history`.
3. Exportar un chat con herramientas y subagentes, importarlo y continuar la
   conversación.
4. Probar importación desde una ruta con espacios en Windows y Linux.
5. Crear el commit en español después de validar regresiones.
