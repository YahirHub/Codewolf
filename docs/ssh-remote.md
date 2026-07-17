# Servidores, credenciales cifradas y conexiones SSH

Codewolf incluye la herramienta interna `ssh_remote` para trabajar profesionalmente con servidores. La arquitectura separa tres elementos:

1. **Perfiles de servidor**, persistentes y globales.
2. **Credenciales cifradas**, portables dentro de `.codewolf`.
3. **Conexiones activas**, vivas únicamente durante el proceso actual.

El agente administra perfiles y solicita operaciones mediante `ssh_remote`, pero nunca recibe la contraseña maestra ni las contraseñas SSH introducidas por el usuario. La entrada secreta se resuelve directamente entre la interfaz local del CLI y el SDK.

## Archivos globales

Los datos se guardan en el directorio global de Codewolf:

- `~/.codewolf/ssh-servers.json`: perfiles, nombres, hosts y referencias no secretas.
- `~/.codewolf/ssh-secrets.enc`: bóveda cifrada de contraseñas SSH y passphrases.

Ambos archivos pueden copiarse junto con el resto de `.codewolf` a otro equipo o servidor. En el nuevo entorno se conserva la configuración, pero la bóveda vuelve a pedir su contraseña maestra.

`ssh-servers.json` nunca contiene contraseñas. Los perfiles solo indican si existe una credencial cifrada mediante metadatos como `password_saved` o `passphrase_saved`.

## Bóveda de credenciales

La bóveda usa:

- derivación de clave mediante `scrypt`;
- cifrado autenticado `AES-256-GCM`;
- salt e IV aleatorios;
- versión de formato y parámetros criptográficos validados;
- escritura atómica y permisos `0600` cuando el sistema los admite.

La contraseña maestra **no se guarda**. Al necesitar una credencial cifrada, el CLI muestra una entrada enmascarada fuera del chat. El valor:

- no se agrega al prompt;
- no se entrega al agente;
- no se incluye en resultados de herramientas;
- no se escribe en logs ni perfiles;
- se utiliza localmente para derivar la clave de descifrado.

La bóveda permanece desbloqueada solo durante la ejecución actual de Codewolf. Al ejecutar `lock_vault`, cerrar el CLI o terminar el proceso, la clave derivada se elimina de memoria. Abrir otra instancia requiere la contraseña maestra nuevamente.

> Si se pierde la contraseña maestra, las credenciales cifradas no pueden recuperarse. Los perfiles de `ssh-servers.json` seguirán disponibles, pero habrá que reemplazar las credenciales de la bóveda.

## Administración de servidores

Acciones disponibles:

- `list_servers`: enumera el registro global y el estado de la bóveda. Es la fuente autoritativa; el agente no debe recorrer carpetas para descubrir servidores.
- `get_server`: consulta por ID, `ssh-server://<id>`, nombre único, host, `host:port` o `username@host`.
- `add_server`: agrega un perfil. `prompt_password=true` o `prompt_passphrase=true` pide y cifra la credencial mediante el CLI.
- `update_server`: edita nombre, host, puerto, usuario, autenticación, huella y tiempos de espera; también puede reemplazar credenciales con los campos `prompt_*`.
- `rename_server`: cambia el nombre visible. `clear_name=true` vuelve a mostrar el host.
- `delete_server`: elimina el perfil y sus credenciales cifradas. `close_connections=true` también cierra conexiones activas.
- `connect_server`: conecta usando solamente el nombre, ID o referencia del perfil.

Cada perfil recibe `server_id` y `server_ref`. Si no tiene nombre personalizado, el nombre visible es el host. Los perfiles antiguos con `label` se migran de forma compatible.

Ejemplo conceptual para guardar un servidor con contraseña, sin enviar la contraseña al agente:

```json
{
  "action": "add_server",
  "name": "Producción",
  "host": "192.168.1.50",
  "username": "deploy",
  "prompt_password": true
}
```

Después puede conectarse únicamente con:

```json
{
  "action": "connect_server",
  "server_id": "Producción"
}
```

Si la bóveda está bloqueada, el CLI solicita la contraseña maestra localmente y continúa la conexión sin exponerla al agente.

## Acciones de la bóveda

- `vault_status`: indica ruta, existencia y estado bloqueado/desbloqueado, sin devolver secretos.
- `unlock_vault`: desbloquea o crea la bóveda mediante la entrada segura del CLI.
- `lock_vault`: elimina de memoria la clave y el contenido descifrado.
- `change_vault_password`: descifra con la contraseña actual y vuelve a cifrar toda la bóveda con una nueva.
- `set_server_password`: solicita una contraseña SSH y la guarda cifrada para el perfil.
- `clear_server_password`: elimina únicamente la contraseña cifrada.
- `set_server_passphrase`: solicita y guarda cifrada la passphrase de la clave privada.
- `clear_server_passphrase`: elimina únicamente la passphrase cifrada.

Las contraseñas y passphrases nunca pueden enviarse como respuesta de estas acciones; solo se informa si existen y si la operación terminó correctamente.

## Compatibilidad de autenticación

Además de la bóveda, `connect` y `connect_server` conservan compatibilidad con:

- `password_env` y `passphrase_env`;
- `private_key_path`;
- contenido efímero `password`, `passphrase` o `private_key` para llamadas internas compatibles;
- agente SSH mediante `agent` o `agent_env`;
- verificación opcional `host_fingerprint_sha256`.

Para uso normal persistente se recomienda la bóveda o una clave privada protegida. Los secretos literales nunca se guardan automáticamente en `ssh-servers.json`.

Si un perfil antiguo no tiene autenticación persistida, `connect_server` puede pedir la contraseña SSH mediante el CLI y, tras conectarse correctamente, guardarla en la bóveda cifrada.

## Conexiones activas

- `connect` abre directamente un host y puede guardar su perfil.
- `connect_server` usa un perfil guardado.
- Ambas devuelven `connection_id` y `connection_ref` (`ssh://<id>`).
- `list_connections` enumera conexiones vivas.
- `status` consulta una conexión.
- `close` y `close_all` cierran una o todas.

Se pueden mantener conexiones simultáneas y reutilizarlas al cambiar de proyecto. Las operaciones de una misma conexión se serializan para evitar carreras entre el agente principal y subagentes.

Los perfiles y la bóveda sobreviven reinicios. Los sockets, shells PTY, SFTP y procesos remotos asociados a la conexión no sobreviven al cierre de Codewolf.

## Navegación, comandos y archivos

Navegación y lectura:

- `pwd`, `cd`, `list`, `stat`, `read_file`;
- `shell_read`;
- `list_connections` y `status`.

Ejecución y shell persistente:

- `exec` para una orden aislada;
- `shell_open`, `shell_write` y `shell_read` para una PTY persistente.

Transferencias y mutaciones SFTP:

- `upload`, `download`, `write_file`;
- `mkdir`, `rename`, `delete`.

`overwrite` es `false` por defecto. Las rutas locales relativas se resuelven desde el proyecto y las remotas desde el `cwd` de la conexión.

## Seguridad desde `/config`

La sección **SEGURIDAD** mantiene tres controles independientes:

- **Modo seguro local:** protege comandos y mutaciones locales.
- **Modo seguro SSH:** protege conexiones, cambios de perfiles/bóveda, ejecución, transferencias y mutaciones remotas. Está activado por defecto.
- **Proteger archivos `.env`:** exige autorización antes de exponer secretos locales o remotos, incluso en modo normal.

Listar perfiles, consultar metadatos y navegar normalmente no requiere permiso SSH. Guardar, cambiar o eliminar credenciales sí lo requiere. La autorización de la operación y la entrada del secreto son pasos separados: aprobar una operación no revela ni autoriza automáticamente el contenido de la bóveda.

Una operación SSH que también pueda exponer un `.env` solicita dos autorizaciones independientes: operación remota y acceso al secreto.

## Portabilidad y copias de seguridad

Para mover la configuración entre equipos, copia el directorio `.codewolf` completo, especialmente:

```text
ssh-servers.json
ssh-secrets.enc
```

No copies uno sin el otro si quieres conservar tanto perfiles como credenciales. La bóveda es portable y no depende de Windows Credential Manager, macOS Keychain ni una clave ligada al hardware. Esa portabilidad implica que la protección depende de una contraseña maestra fuerte.

Evita sincronizar `.codewolf` en repositorios públicos. Conserva una copia de seguridad del archivo cifrado y recuerda la contraseña maestra en un gestor de contraseñas independiente.

## Límites

- La bóveda se desbloquea por proceso, no por sesión de Windows.
- Las transferencias interrumpidas no se reanudan automáticamente.
- La huella del host es opcional; configúrala para validación estricta del servidor.
- La aceleración nativa opcional `cpu-features` se excluye del binario Bun; `ssh2` usa su implementación portable.
- JavaScript no permite garantizar el borrado físico inmediato de todas las copias temporales de una cadena, aunque Codewolf evita persistirlas y limpia explícitamente los buffers criptográficos controlados.
- La herramienta no sustituye usuarios restringidos, rotación de credenciales, copias de seguridad, firewall ni políticas del servidor.
