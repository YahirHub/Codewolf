# Modos de seguridad

Codewolf ofrece tres protecciones independientes desde `/config`. Se guardan globalmente en `~/.codewolf/settings.json` y se aplican al agente principal y a todos los subagentes.

## Modo seguro local

Está desactivado por defecto. Cuando se activa, Codewolf pide permiso individual antes de ejecutar:

- Comandos solicitados por el modelo mediante `run_terminal_command`.
- Creación o sobrescritura de archivos con `write_file`.
- Ediciones mediante `str_replace`.
- Creación, modificación o eliminación mediante `apply_patch`.
- Hooks automáticos del proyecto.
- Herramientas personalizadas, MCP y servicios externos.
- Escrituras automáticas de `contexto/` realizadas por el mantenimiento de memoria persistente.

Las herramientas de lectura locales siguen disponibles sin confirmación. Los comandos que el usuario escribe directamente en el modo Bash son acciones explícitas y no muestran una segunda confirmación.

## Modo seguro SSH

Está activado por defecto. Controla la herramienta interna `ssh_remote` sin depender del Modo seguro local.

Solicita autorización para:

- Abrir una conexión SSH.
- Ejecutar comandos aislados.
- Abrir una shell persistente o enviarle comandos.
- Subir o descargar archivos.
- Escribir, crear, renombrar o eliminar archivos y directorios remotos.

No solicita autorización para listar conexiones, consultar su estado, navegar con `pwd`/`cd`/`list`, consultar metadatos, leer archivos normales, leer salida pendiente de una shell ya autorizada o cerrar conexiones. La excepción son los archivos `.env` protegidos, cuya lectura se rige por el control independiente siguiente.

Consulta [ssh-remote.md](ssh-remote.md) para conocer las acciones, persistencia y autenticación disponibles.

## Protección de archivos `.env`

Está activada por defecto y también funciona cuando los dos modos seguros están desactivados. Pide autorización antes de exponer contenido de `.env` o `.env.*` mediante:

- Lectura local o remota.
- Búsqueda explícita de su contenido.
- Comandos locales o SSH que puedan mostrarlo.
- Descarga de un `.env` remoto.
- Subida de un `.env` local a un servidor.
- Herramientas externas cuyo input indique que accederán al archivo.

Navegar, listar o consultar metadatos no muestra el contenido y no solicita este permiso. Los archivos de plantilla `.env.example`, `.env.sample`, `.env.template`, `.env.dist` y `.env.defaults` quedan permitidos.

Las búsquedas amplias de código excluyen `.env*` cuando la protección está activa. Para buscar uno de forma explícita, Codewolf debe mostrar la solicitud de autorización antes de ejecutar la herramienta. Si una misma acción también requiere permiso local o SSH —por ejemplo, subir `.env.production`— ambos permisos se solicitan de forma consecutiva; aprobar el acceso al secreto nunca autoriza implícitamente la transferencia o el comando.

## Pantalla de autorización

La solicitud muestra:

- La operación exacta.
- El comando, archivo, conexión o herramienta afectada.
- El agente o subagente que la solicita.
- La razón proporcionada por el modelo o una explicación segura generada por Codewolf.
- Una vista previa limitada y con contraseñas, tokens, claves privadas y credenciales ocultas.

Las opciones son:

- **PERMITIR ESTA VEZ:** autoriza únicamente esa operación; la siguiente vuelve a solicitar permiso.
- **RECHAZAR:** no ejecuta la operación y devuelve al modelo un resultado estructurado para que pueda corregir el plan o continuar sin esa acción.

Atajos: flechas o Tab para seleccionar, Enter para confirmar, `Y` para permitir y `N`/Esc para rechazar.

## Seguridad y concurrencia

Las solicitudes concurrentes se serializan en una cola FIFO para que nunca se superpongan dos diálogos. Detener una ejecución rechaza de forma segura las solicitudes pendientes. Si una política exige autorización pero el cliente no configuró una interfaz capaz de resolverla, la operación se deniega; el sistema nunca continúa por defecto.

Estas protecciones no reemplazan usuarios sin privilegios, copias de seguridad, aislamiento, políticas de red, verificación de host, Git ni controles propios del servidor. Son una frontera adicional para revisar acciones generadas por el modelo.
