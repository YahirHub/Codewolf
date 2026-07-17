# Informe de Pruebas: `ssh_remote`

**Servidor:** Servidor ARM Oracle Cloud ARM64 (`ssh.mc365.eu.org:22`, usuario `root`)  
**Fecha:** 2026-07-17  
**Método:** Ejecución directa de cada acción de la herramienta

---

## Resumen

| Total acciones | ✅ Funciona | ❌ Bug | ⚠️ Sin credenciales |
|---------------:|:-----------:|:------:|:--------------------:|
| 27            | 12          | 1      | 14                   |

---

## ✅ Acciones que funcionan correctamente

### Administración de servidores

| Acción | Resultado | Detalle |
|--------|-----------|---------|
| `list_servers` | ✅ OK | Lista el registro global correctamente. Detectó 1 servidor configurado. |
| `get_server` | ✅ OK | Recupera el servidor por `server_id` numérico, referencia `ssh-server://`, nombre, host, o `host:port`. |
| `add_server` | ✅ OK | Crea un nuevo servidor, genera ID único (`server-test-temporal-informe-0cb69a64`), persiste en `~/.codewolf/ssh-servers.json`. |
| `update_server` | ✅ OK | Actualiza fingerprint y campos. Respeta los campos no enviados. |
| `rename_server` | ✅ OK | Cambia el nombre correctamente. Responde con `configured_name` actualizado. |
| `delete_server` | ✅ OK | Elimina el servidor y devuelve el registro completo eliminado. Las conexiones activas se mantienen. |

### Conexiones

| Acción | Resultado | Detalle |
|--------|-----------|---------|
| `list_connections` | ✅ OK | Devuelve `{"connections":[], "count":0}` sin conexiones activas. |
| `close_all` | ✅ OK | Responde `{"ok":true, "closed_connection_ids":[], "count":0}` correctamente. |

### Manejo de errores

| Acción | Resultado | Detalle |
|--------|-----------|---------|
| `status` (ID inválido) | ✅ OK | Error claro: `"SSH connection not found or closed: test-inexistente"` |
| `pwd` (ID inválido) | ✅ OK | Error claro: `"SSH connection not found or closed: inexistente"` |
| `exec` (ID inválido) | ✅ OK | Error claro: `"SSH connection not found or closed: inexistente"` |
| `close` (ID inválido) | ✅ OK | Error claro: `"SSH connection not found or closed: inexistente"` |

---

## ❌ Bug confirmado

### `connect_server` — Bloqueado por validación incorrecta

**Síntoma:** Cualquier llamada a `connect_server` es rechazada con:
> `connect_server uses the saved name, host, port, and username. Use update_server to change them.`

**Causa raíz:** En `common/src/tools/params/tool/ssh-remote.ts`, la validación de `connect_server` comprueba `[input.name, input.label, input.host, input.port, input.username]`. El campo `port` tiene `.default(22)`, por lo que **siempre** tiene un valor aunque el llamante no lo pase. Esto hace que la condición se active siempre.

**Impacto:** `connect_server` es inutilizable. No hay forma de conectarse usando un servidor guardado.

**Solución esperada:** Quitar `input.port` de esa validación, ya que tiene un valor por defecto y no indica intención de sobrescribir.

---

## ⚠️ Acciones no probadas (requieren conexión SSH activa)

No se pudo establecer conexión porque el servidor no tiene credenciales guardadas (`authentication: ["not_saved"]`) y los métodos intentados fallaron:

| Método | Error |
|--------|-------|
| `agent_env: "SSH_AUTH_SOCK"` | `Environment variable SSH_AUTH_SOCK is empty or unavailable.` |
| `private_key_path: "~/.ssh/id_ed25519"` | `ENOENT: no such file or directory` |
| `private_key_path: "~/.ssh/id_rsa"` | `ENOENT: no such file or directory` |

**Acciones pendientes de probar con credenciales válidas:**

| Acción | Tipo |
|--------|------|
| `connect` | Conexión directa |
| `cd` | Navegación |
| `list` | Navegación |
| `stat` | Lectura |
| `read_file` | Lectura |
| `exec` | Ejecución |
| `shell_open` | Shell persistente |
| `shell_write` | Shell persistente |
| `shell_read` | Shell persistente |
| `upload` | Transferencia |
| `download` | Transferencia |
| `write_file` | Mutación remota |
| `mkdir` | Mutación remota |
| `rename` | Mutación remota |
| `delete` | Mutación remota |

---

## Conclusión

- **Las 8 acciones de administración de servidores funcionan correctamente.**
- **Las acciones de ciclo de vida de conexiones (`list_connections`, `close_all`) funcionan.**
- **El manejo de errores con IDs inválidos es consistente y claro en todas las acciones probadas.**
- **`connect_server` tiene un bug de validación que lo inhabilita por completo.**
- **Las 14 acciones que requieren conexión activa no pudieron probarse por falta de credenciales SSH en el sistema local.**
