# 042 — Registro global profesional de servidores SSH

# Fecha

2026-07-17

# Objetivo

Convertir `ssh_remote` en una herramienta profesional que pueda consultar y administrar servidores SSH configurados sin inspeccionar carpetas del proyecto, manteniendo nombres, compatibilidad con registros antiguos y reutilización global entre proyectos y reinicios.

# Decisiones tomadas

- Se separan formalmente los **servidores configurados** de las **conexiones activas**.
- Los perfiles no secretos se guardan en `~/.codewolf/ssh-servers.json`.
- Las conexiones, sockets, shells, credenciales literales y canales SFTP permanecen únicamente en memoria.
- `list_servers` es la fuente autoritativa para responder qué servidores están configurados; el agente no debe buscar archivos o directorios para inferirlos.
- `name` es el campo moderno. `label` continúa aceptándose como alias heredado.
- Cuando no existe nombre personalizado, la salida visible es únicamente el host.
- `connect` guarda por defecto la configuración no secreta; `save_server=false` conserva una conexión efímera.
- `connect_server` usa host, puerto y usuario del perfil guardado. Los cambios permanentes deben realizarse mediante `update_server`.

# Arquitectura actual

1. `common` publica las acciones y validaciones de administración de servidores.
2. `sdk/src/tools/ssh-server-store.ts` implementa almacenamiento global, migración, resolución de referencias y escritura atómica.
3. `PersistentSshManager` relaciona perfiles mediante `server_id` con conexiones vivas mediante `connection_id`.
4. `/config` conserva el Modo seguro SSH: listar y consultar perfiles es libre; agregar, editar, renombrar, eliminar o conectar requiere autorización cuando está activado.
5. Los tipos públicos de agentes y la plantilla inicial se mantienen sincronizados.

# Acciones agregadas

- `list_servers`
- `get_server`
- `add_server`
- `update_server`
- `rename_server`
- `delete_server`
- `connect_server`

Las acciones aceptan `server_id`, `ssh-server://<id>`, nombre único, host, `host:port` o `username@host` cuando la resolución no es ambigua.

# Seguridad

- No se persisten `password`, `passphrase`, `private_key` ni ningún contenido secreto.
- Solo pueden guardarse referencias: `password_env`, `passphrase_env`, `private_key_path`, `agent` y `agent_env`.
- Un archivo `.env` protegido no puede registrarse como `private_key_path`.
- El cargador ignora campos secretos de formatos heredados y nunca los devuelve.
- Un registro JSON dañado o con versión desconocida se rechaza para evitar sobrescribir silenciosamente información existente.
- El archivo se escribe atómicamente y usa modo `0600` cuando el sistema lo admite.

# Compatibilidad

- Los perfiles antiguos con `label` se normalizan como `name`.
- Los perfiles sin nombre muestran `host`.
- `connection.label` continúa apareciendo en la salida como alias de compatibilidad, pero su valor coincide con el nuevo `name`.
- Las conexiones activas sin perfil aparecen separadas como `active_unconfigured_servers`.

# Archivos importantes modificados

- `common/src/tools/params/tool/ssh-remote.ts`
- `common/src/types/tool-permission.ts`
- `common/src/util/tool-permission.ts`
- `common/src/util/protected-env.ts`
- `common/src/__tests__/protected-env-permissions.test.ts`
- `sdk/src/tools/ssh-server-store.ts`
- `sdk/src/tools/ssh-remote.ts`
- `sdk/src/tools/__tests__/ssh-remote.test.ts`
- `agents/types/tools.ts`
- `common/src/templates/initial-agents-dir/types/tools.ts`
- `cli/src/components/tool-permission-screen.tsx`
- `docs/ssh-remote.md`
- `AGENTS.md`
- `contexto/000-contexto-maestro.md`

# Validación realizada

- Typecheck estricto aislado de `ssh-server-store.ts` y `ssh-remote.ts` con stubs de los contratos externos: aprobado.
- Transpilación sintáctica de todos los archivos TypeScript/TSX modificados: aprobada.
- Prueba de ejecución real del registro con Node: agregar, resolver por nombre/ref, editar, renombrar, eliminar, fallback a host, bloqueo de `.env` y rechazo de JSON dañado: aprobada.
- Verificación de sincronización exacta entre `agents/types/tools.ts` y la plantilla inicial: aprobada.
- La suite completa con Bun queda pendiente de ejecución en Windows porque este entorno no contiene Bun ni las dependencias del monorepo.

# Riesgos

- Los perfiles sobreviven reinicios, pero una conexión activa no puede sobrevivir al cierre del proceso.
- Un perfil basado únicamente en una contraseña literal puede guardar el host, pero necesitará la contraseña nuevamente para reconectar.
- Varias entradas con el mismo host pueden requerir `server_id` o un nombre único para evitar ambigüedad.

# Próximos pasos

- Ejecutar `bun run tests` y `bun run build:binary` en Windows.
- Probar manualmente `add_server`, `list_servers`, `rename_server`, `connect_server` y `delete_server` contra un servidor controlado.
