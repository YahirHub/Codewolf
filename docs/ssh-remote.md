# Conexiones SSH persistentes

Codewolf incluye la herramienta interna `ssh_remote` para trabajar en servidores sin convertir SSH en una pantalla o función directa para el usuario. El agente abre una conexión una sola vez, recibe un `connection_id` y reutiliza esa referencia mientras el proceso actual del CLI siga activo.

## Ciclo de vida

- `connect` abre una conexión y devuelve `connection_id` y `connection_ref` con formato `ssh://<id>`.
- `list_connections` enumera todas las conexiones activas.
- `status` consulta una conexión concreta.
- `close` cierra solo la conexión indicada.
- `close_all` cierra todas las conexiones activas del proceso actual de Codewolf.

Se pueden mantener conexiones simultáneas a servidores diferentes y reutilizarlas aunque Codewolf cambie el directorio o proyecto activo dentro del mismo proceso. Las acciones destinadas a una misma conexión se serializan para que el agente principal y los subagentes no alteren simultáneamente su directorio, shell o canal SFTP. Las credenciales y sockets permanecen únicamente en memoria; al cerrar Codewolf, las conexiones terminan y no se reconstruyen automáticamente en el siguiente arranque.

## Navegación y lectura

Estas acciones no requieren autorización del **Modo seguro SSH**:

- `pwd`: directorio remoto actual.
- `cd`: cambia el directorio persistente de la conexión.
- `list`: navega un directorio; si no se proporciona `path`, usa el directorio actual.
- `stat`: consulta metadatos de un archivo o directorio.
- `read_file`: lee contenido con límite de bytes y salida UTF-8 o Base64.
- `shell_read`: recupera la salida pendiente de una shell ya autorizada.

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

`overwrite` es `false` por defecto para impedir reemplazos accidentales. Las rutas locales relativas se resuelven desde la raíz del proyecto; las rutas remotas relativas se resuelven desde el `cwd` persistente de la conexión.

## Seguridad desde `/config`

La sección **SEGURIDAD** contiene tres controles independientes:

- **Modo seguro local:** solicita permiso para comandos locales, mutaciones de archivos, hooks, MCP y herramientas externas. Está desactivado por defecto.
- **Modo seguro SSH:** solicita permiso para conectar, ejecutar, abrir/escribir una shell, subir, descargar, escribir, crear, renombrar o eliminar en remoto. Está activado por defecto.
- **Proteger archivos .env:** solicita permiso antes de exponer contenido de `.env` o `.env.*` local o remoto. Está activado por defecto y también funciona en modo normal.

Cada permiso autoriza solo la operación mostrada. Una transferencia o comando SSH que además pueda exponer un `.env` solicita dos autorizaciones consecutivas: la operación remota y el acceso al secreto. Si no existe una interfaz capaz de resolver un permiso obligatorio, el SDK deniega la operación; nunca continúa por defecto.

## Autenticación

`connect` admite:

- `password_env` o `password`.
- `private_key_path` o `private_key`, con `passphrase_env`/`passphrase` cuando corresponda.
- Socket de agente mediante `agent`.
- Verificación opcional de host mediante `host_fingerprint_sha256`.

Se deben preferir variables de entorno, rutas de claves y agentes SSH en lugar de incluir secretos directamente en una llamada de herramienta. La vista previa del permiso oculta contraseñas, claves privadas, tokens y campos de credenciales.

## Límites actuales

- La persistencia dura el proceso actual de Codewolf, no reinicios del CLI.
- `close_all` actúa sobre todas las conexiones abiertas por el proceso actual de Codewolf.
- La huella del host es opcional; debe configurarse cuando la identidad del servidor necesite validación estricta.
- La aceleración nativa opcional `cpu-features` se excluye del binario Bun; `ssh2` utiliza su ruta JavaScript portable.
- La herramienta no eleva privilegios ni sustituye usuarios restringidos, copias de seguridad, firewall o políticas del servidor.
