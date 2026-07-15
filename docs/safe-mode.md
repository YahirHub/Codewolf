# Modo seguro

El Modo seguro es una protección opcional para ejecutar Codewolf en servidores, producción o proyectos sensibles. Se activa desde `/config` y se guarda globalmente en `~/.codewolf/settings.json`.

## Operaciones que requieren autorización

Cuando está activo, Codewolf pide permiso individual antes de ejecutar:

- Comandos solicitados por el modelo mediante `run_terminal_command`.
- Creación o sobrescritura de archivos con `write_file`.
- Ediciones mediante `str_replace`.
- Creación, modificación o eliminación mediante `apply_patch`.
- Hooks automáticos del proyecto.
- Herramientas personalizadas, MCP y servicios externos.
- Escrituras automáticas de `contexto/` realizadas por el mantenimiento de memoria persistente.

Las herramientas de lectura locales siguen disponibles sin confirmación. Los comandos que el usuario escribe directamente en el modo Bash son acciones explícitas del usuario y no muestran una segunda confirmación.

## Pantalla de autorización

La solicitud muestra:

- La operación exacta.
- El comando, archivo o herramienta afectada.
- El agente o subagente que la solicita.
- La razón proporcionada por el modelo o una explicación segura generada por Codewolf.
- Una vista previa limitada y con secretos ocultos para herramientas externas.

Las opciones son:

- **PERMITIR ESTA VEZ:** autoriza únicamente esa operación. La siguiente vuelve a solicitar permiso.
- **RECHAZAR:** no ejecuta la operación y devuelve al modelo un resultado estructurado de permiso denegado para que pueda corregir el plan o continuar sin esa acción.

Atajos: flechas o Tab para seleccionar, Enter para confirmar, `Y` para permitir y `N`/Esc para rechazar.

## Seguridad y concurrencia

Las solicitudes concurrentes se serializan en una cola FIFO para que nunca se superpongan dos diálogos. Detener una ejecución rechaza de forma segura las solicitudes pendientes. Si la interfaz de autorización falla, la operación se deniega; el sistema nunca continúa por defecto.

El Modo seguro no reemplaza usuarios sin privilegios, copias de seguridad, aislamiento, políticas de red, Git ni controles propios del servidor. Es una frontera adicional para revisar acciones generadas por el modelo.
