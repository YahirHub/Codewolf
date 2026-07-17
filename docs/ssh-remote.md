# Servidores y conexiones SSH persistentes

Codewolf incluye la herramienta interna `ssh_remote` para trabajar profesionalmente con servidores sin convertir SSH en una pantalla o función directa para el usuario. La herramienta distingue entre **servidores configurados**, que se guardan globalmente, y **conexiones activas**, que mantienen sockets, SFTP y shells durante el proceso actual.

## Servidores configurados

Los perfiles se guardan en `~/.codewolf/ssh-servers.json`. Son globales: están disponibles desde cualquier proyecto y después de reiniciar Codewolf.

Acciones de administración:

- `list_servers`: enumera el registro global. Es la fuente autoritativa cuando se pregunta qué servidores SSH están configurados; el agente no debe buscar ni leer carpetas de Codewolf manualmente.
- `get_server`: consulta un perfil por `server_id`, referencia `ssh-server://<id>`, nombre único, host, `host:port` o `username@host`.
- `add_server`: agrega un perfil.
- `update_server`: edita nombre, host, puerto, usuario, referencias de autenticación, huella y tiempos de espera.
- `rename_server`: modifica únicamente el nombre visible. `clear_name=true` elimina el nombre personalizado.
- `delete_server`: elimina el perfil. Por defecto conserva las conexiones activas; `close_connections=true` también las cierra.
- `connect_server`: abre una conexión usando un perfil guardado.

Cada perfil recibe `server_id` y `server_ref`. `name` es el nombre visible. Cuando un perfil no tiene nombre personalizado, `name` devuelve únicamente el host. Los perfiles antiguos que usaban `label` se leen de forma compatible y se normalizan como nombre.

El registro se escribe de manera atómica con permisos `0600` cuando el sistema los admite. Un archivo dañado o con una versión desconocida se rechaza en lugar de sobrescribirse silenciosamente.

## Datos que pueden persistirse

Solo se guardan metadatos no secretos:

- nombre, host, puerto y usuario;
- `password_env` y `passphrase_env`;
- `private_key_path`;
- `agent` o `agent_env`;
- huella SHA-256 del host;
- tiempos de conexión y keepalive.

Nunca se guardan contraseñas, passphrases, contenido de claves privadas, sockets activos, shells ni salida remota. Un `.env` protegido tampoco puede registrarse como ruta de clave privada.

`connect` abre directamente un host y, por defecto, guarda o actualiza su perfil no secreto (`save_server=true`). Puede usarse `save_server=false` para una conexión efímera. Si se conecta mediante una contraseña literal, el host puede recordarse, pero una reconexión posterior requerirá proporcionar nuevamente la credencial o configurar una referencia segura.

## Conexiones activas

- `connect` abre directamente una conexión.
- `connect_server` conecta un perfil guardado.
- Ambas devuelven `connection_id` y `connection_ref` con formato `ssh://<id>`.
- `list_connections` enumera las conexiones vivas.
- `status` consulta una conexión concreta.
- `close` cierra una conexión.
- `close_all` cierra todas las conexiones activas.

Se pueden mantener conexiones simultáneas a servidores diferentes y reutilizarlas aunque Codewolf cambie el directorio o proyecto activo. Las acciones destinadas a una misma conexión se serializan para que el agente principal y los subagentes no alteren simultáneamente su directorio, shell o canal SFTP.

Los perfiles sobreviven al reinicio; las conexiones vivas no. Al cerrar Codewolf terminan los sockets, shells y canales SFTP. Después puede abrirse una nueva conexión con `connect_server` usando el perfil global.

## Navegación y lectura

Estas acciones no requieren autorización del **Modo seguro SSH**:

- `list_servers` y `get_server` para consultar perfiles sin secretos;
- `list_connections` y `status`;
- `pwd`, `cd`, `list` y `stat`;
- `read_file`;
- `shell_read`;
- `close` y `close_all`.

La protección independiente de `.env` sigue aplicándose: leer o descargar un `.env` real, buscar explícitamente su contenido o ejecutar un comando que pueda mostrarlo solicita permiso aunque el Modo seguro local o SSH esté desactivado. Archivos plantilla como `.env.example`, `.env.sample` y `.env.template` no se consideran secretos.

## Comandos persistentes

Para una orden aislada se usa `exec`. Codewolf antepone el directorio guardado de la conexión y devuelve salida, error, código de terminación y señal.

Para conservar estado de shell entre llamadas:

1. `shell_open` crea una PTY persistente.
2. `shell_write` envía comandos, activaciones de entornos, exportaciones o entrada interactiva.
3. `shell_read` recupera salida adicional sin cerrar la shell.

La shell permite continuar procesos remotos o conservar variables y cambios de sesión. `cd` mantiene además un directorio estable para operaciones SFTP y llamadas posteriores a `exec`.

## Archivos remotos

La herramienta usa SFTP sobre la misma conexión:

- `upload`: archivo local a remoto.
- `download`: archivo remoto a local.
- `write_file`: crea o reemplaza contenido remoto UTF-8/Base64.
- `mkdir`: crea directorios, opcionalmente de forma recursiva.
- `rename`: mueve o renombra.
- `delete`: elimina archivos o directorios; la eliminación recursiva debe solicitarse explícitamente.

`overwrite` es `false` por defecto para impedir reemplazos accidentales. Las rutas locales relativas se resuelven desde la raíz del proyecto; al guardar un perfil, una ruta relativa de clave privada se convierte en absoluta para que siga funcionando desde otros proyectos. Las rutas remotas relativas se resuelven desde el `cwd` persistente de la conexión.

## Seguridad desde `/config`

La sección **SEGURIDAD** contiene tres controles independientes:

- **Modo seguro local:** solicita permiso para comandos locales, mutaciones de archivos, hooks, MCP y herramientas externas. Está desactivado por defecto.
- **Modo seguro SSH:** solicita permiso para conectar, agregar/editar/renombrar/eliminar perfiles, ejecutar, abrir/escribir una shell, subir, descargar, escribir, crear, renombrar o eliminar en remoto. Está activado por defecto.
- **Proteger archivos .env:** solicita permiso antes de exponer contenido de `.env` o `.env.*` local o remoto. Está activado por defecto y también funciona en modo normal.

Listar o consultar perfiles no solicita permiso SSH porque no devuelve secretos. Cada permiso autoriza solo la operación mostrada. Una transferencia o comando SSH que además pueda exponer un `.env` solicita dos autorizaciones consecutivas: la operación remota y el acceso al secreto. Si no existe una interfaz capaz de resolver un permiso obligatorio, el SDK deniega la operación.

## Autenticación

`connect` y `connect_server` admiten:

- `password_env` o una contraseña efímera mediante `password`;
- `private_key_path` o contenido efímero mediante `private_key`, con `passphrase_env`/`passphrase`;
- socket de agente mediante `agent` o `agent_env`;
- verificación opcional mediante `host_fingerprint_sha256`.

Para perfiles guardados se aceptan únicamente referencias no secretas. La vista previa del permiso oculta contraseñas, claves privadas, tokens y campos de credenciales.

## Límites actuales

- Los perfiles sobreviven reinicios; las conexiones, shells y transferencias activas duran únicamente el proceso actual.
- Las transferencias interrumpidas no se reanudan automáticamente.
- La huella del host es opcional; debe configurarse cuando la identidad del servidor necesite validación estricta.
- La aceleración nativa opcional `cpu-features` se excluye del binario Bun; `ssh2` utiliza su ruta JavaScript portable.
- La herramienta no eleva privilegios ni sustituye usuarios restringidos, copias de seguridad, firewall o políticas del servidor.
