# 043 — Bóveda cifrada portable para credenciales SSH

## Solicitud

Los perfiles SSH ya eran globales, pero las contraseñas no se guardaban. Se pidió una solución portable al mover `.codewolf` entre la PC y servidores, con contraseña maestra solicitada directamente por el CLI y sin exponer secretos al agente. Se eligió el alcance más seguro: desbloqueo únicamente durante el proceso actual de Codewolf.

## Arquitectura implementada

- `~/.codewolf/ssh-servers.json` conserva exclusivamente perfiles y metadatos no secretos.
- `~/.codewolf/ssh-secrets.enc` guarda contraseñas SSH y passphrases cifradas por `server_id`.
- La bóveda usa `scrypt` (`N=32768`, `r=8`, `p=1`) para derivar una clave de 256 bits y `AES-256-GCM` con salt, IV y etiqueta de autenticación aleatorios.
- El archivo tiene formato versionado, validación de límites criptográficos, escritura atómica y permisos `0600` cuando están disponibles.
- La contraseña maestra nunca se guarda. La clave derivada y el contenido descifrado existen solo en la instancia actual del SDK; `lock_vault` serializa el cierre y limpia el buffer de clave controlado.

## Entrada secreta fuera del agente

Se añadió `RequestSecretFn` y `SecretPromptBridge` entre SDK y CLI. La interfaz `SecretPromptScreen` usa entrada enmascarada, confirmación para creación/cambio de contraseña maestra, cancelación y cola FIFO.

Los valores introducidos:

- no se agregan al chat ni al historial;
- no forman parte del tool call generado por el modelo;
- no aparecen en permisos, resultados ni logs;
- se entregan directamente al gestor local de bóveda.

## Acciones nuevas de `ssh_remote`

- `vault_status`, `unlock_vault`, `lock_vault`, `change_vault_password`.
- `set_server_password`, `clear_server_password`.
- `set_server_passphrase`, `clear_server_passphrase`.
- `add_server`, `update_server`, `connect` y `connect_server` aceptan `prompt_password`/`prompt_passphrase` para solicitar credenciales localmente.

`connect_server` recupera automáticamente las credenciales cifradas usando solo nombre, ID o referencia. Un perfil antiguo sin autenticación persistida puede solicitar una contraseña local y guardarla cifrada después de una conexión correcta.

## Compatibilidad y portabilidad

- Continúan funcionando `password_env`, `passphrase_env`, `private_key_path`, `agent` y sus variantes por variable de entorno.
- Los perfiles antiguos, nombres ausentes y alias `label` mantienen su migración previa.
- Copiar toda la carpeta `.codewolf` conserva perfiles y bóveda en otro equipo; se vuelve a solicitar la misma contraseña maestra.
- El diseño no depende de Windows Credential Manager ni de hardware específico para no romper la portabilidad solicitada.

## Seguridad y límites

- Las operaciones que modifican bóveda o credenciales se clasifican como configuración remota y respetan el Modo seguro SSH.
- Aprobar la operación no revela el secreto: el prompt local es una fase separada.
- Al cerrar Codewolf, la memoria del proceso desaparece y la siguiente ejecución vuelve a solicitar la contraseña maestra.
- Perder la contraseña maestra hace irrecuperables las credenciales cifradas; los perfiles siguen disponibles para reemplazarlas.
- Las cadenas de JavaScript no pueden limpiarse de memoria con garantía absoluta, pero no se persisten y los buffers criptográficos controlados se sobrescriben.

## Validación

- Typecheck estricto enfocado de bóveda, herramienta SSH y permisos.
- Prueba criptográfica real: el archivo no contiene contraseña maestra, contraseña SSH ni passphrase en texto claro.
- Bloqueo y reintento con contraseña incorrecta.
- Cambio de contraseña maestra sin alterar credenciales.
- Alta/listado de servidor con contraseña solicitada por el CLI y guardada solo en la bóveda.
- Serialización de `lock_vault` para evitar carreras con escrituras concurrentes.

## Pendiente operativo

Ejecutar en Windows la suite completa y `bun run build:binary`, además de probar una conexión real con contraseña, reinicio del CLI y copia de `.codewolf` a otro equipo.
