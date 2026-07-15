# Metodología opcional de proyectos

Codewolf puede aplicar una metodología profesional y persistente sin imponerla a todos los usuarios. Las dos funciones se activan por separado desde:

```text
/config
```

## Contexto persistente del proyecto

Cuando está activado, Codewolf busca `contexto/*.md` al abrir el proyecto. Los documentos se ordenan por prefijo numérico y un agente de solo lectura genera un resumen de arquitectura, reglas, decisiones, problemas, trabajo terminado y pendientes.

La lectura automática está limitada a 200 archivos y 320 000 bytes para no desbordar modelos con ventanas pequeñas. Si se supera el límite, conserva `000-contexto-maestro.md` y prioriza los documentos numerados más recientes; el agente principal puede abrir manualmente cualquier archivo omitido cuando una decisión lo requiera. El siguiente número se calcula usando todos los nombres existentes, incluso los no enviados al resumidor, para evitar colisiones.

El resumen se guarda fuera del repositorio, dentro de los datos locales de Codewolf, y se reutiliza mientras la huella SHA-256 de los documentos no cambie. La huella considera todos los nombres y metadatos, además del contenido seleccionado. Así no se consume otra llamada al modelo cada vez que se envía un mensaje ni se conserva un resumen obsoleto al aparecer un archivo reciente fuera del límite.

En cada ejecución se añaden dos archivos virtuales de conocimiento:

```text
.codewolf/metodologia-desarrollo.md
.codewolf/contexto-resumen.md
```

No se escriben físicamente en el proyecto. El agente principal recibe esas reglas y puede abrir los documentos originales cuando una decisión dependa de ellos.

Si `contexto/` todavía no existe, Codewolf lo crea automáticamente después de la primera implementación con cambios reales. Un agente de documentación genera el registro numerado a partir de la solicitud, el resultado y los archivos modificados; si el proveedor falla, se utiliza un documento local seguro para no perder la memoria. La estructura inicial es:

```text
contexto/
├── 000-contexto-maestro.md
└── 001-<cambio-importante>.md
```

Cada documento numerado debe registrar fecha, objetivo, decisiones, arquitectura, librerías, archivos modificados, problemas, soluciones, pendientes y próximos pasos. Nunca debe contener credenciales o secretos.

### Comportamiento de `/init`

Con **Contexto persistente del proyecto** activado, `/init` no se limita a crear `knowledge.md` y `.agents/`. El flujo:

1. crea `contexto/000-contexto-maestro.md` si falta;
2. analiza README, AGENTS, documentación, manifiestos, estructura, scripts y código relevante;
3. actualiza el contexto maestro;
4. crea el siguiente registro numerado de inicialización o actualización;
5. invalida la caché para que el siguiente turno lea el estado nuevo.

Si `contexto/` ya existe, `/init` lo refresca sin borrar documentos anteriores.

### Mantenimiento después de implementaciones

Al terminar correctamente un turno con archivos modificados, Codewolf comprueba si el agente principal actualizó `contexto/`. Si no lo hizo, ejecuta un agente de documentación de solo salida estructurada y escribe el siguiente registro numerado. También actualiza una sección delimitada dentro de `000-contexto-maestro.md` sin reemplazar el contenido manual existente.

Las escrituras automáticas de contexto participan en `/rewind` y en los commits verificados. En repositorios Git también se detectan cambios producidos por terminal cuando el archivo estaba limpio al comenzar el turno.

## Investigación cuando hay incertidumbre

La metodología exige que el agente use las herramientas de búsqueda y los agentes de documentación cuando no tenga suficiente conocimiento o la información pueda haber cambiado. Esto incluye especialmente:

- estructura y stack de un proyecto nuevo;
- versiones, APIs y compatibilidad;
- seguridad y despliegue;
- mantenimiento de dependencias;
- cambios recientes de frameworks o plataformas.

Se deben priorizar documentación oficial, repositorios oficiales, changelogs, guías de migración y fuentes primarias. Si la búsqueda no está configurada, el agente debe indicarlo y trabajar con la evidencia local disponible.

## Commits automáticos verificados

Cuando esta opción está activada, Codewolf registra el estado Git antes del turno y observa las ediciones hechas mediante `write_file`, `str_replace` y `apply_patch`. Al terminar correctamente una implementación, pausa la cola y pide al usuario probar el resultado.

La pantalla ofrece:

```text
Funciona, crear commit
Necesita correcciones
No crear commit
```

Si el usuario elige **No crear commit**, el conjunto elegible se conserva fuera del repositorio en los datos locales de Codewolf. En el siguiente turno se compara cada archivo mediante SHA-256: los que siguen exactamente como Codewolf los dejó se acumulan; los modificados manualmente se excluyen y se muestran como omitidos. Este estado sobrevive reinicios del CLI.

Si el usuario confirma que funciona:

1. Codewolf vuelve a consultar Git y descarta rutas que el agente tocó pero dejó finalmente sin cambios.
2. Verifica que los archivos elegibles no hayan cambiado desde que terminó el agente.
3. Comprueba que no existan cambios preparados previamente en Git.
4. Construye un mensaje semántico local a partir del estado Git, los tipos de cambio, las rutas, los títulos de documentos Markdown y la solicitud original.
5. Si hay proveedor activo, puede refinar ese borrador; una respuesta vacía, genérica o una caída temporal conserva el mensaje local.
6. Repite las comprobaciones después de generar el mensaje, prepara solamente los archivos elegibles y verifica el staging exacto.
7. Crea el commit y muestra su hash y mensaje.

El Summary debe describir el trabajo real. Nunca se aceptan frases mecánicas como `Guardar cambios verificados`, `Aplicar cambios` o `Actualizar cambios`. Cuando el conjunto está formado por `contexto/*.md` y archivos de memoria, el mensaje indica que se creó o actualizó el contexto persistente del proyecto.

El commit confirmado incluye la unión de todas las implementaciones verificadas pendientes desde el último commit automático. Para no mezclar trabajo ajeno, se excluyen automáticamente:

- archivos que ya estaban modificados manualmente antes del primer turno elegible;
- rutas no editadas por herramientas estructuradas;
- cambios fuera del repositorio activo;
- archivos modificados manualmente después de la implementación;
- cambios que ya estaban en el área de preparación.

Las modificaciones realizadas mediante Bash, scripts, MCP, Git o editores externos no se agregan automáticamente. El flujo no ejecuta `git push`.

## Configuración persistente

Las opciones se guardan globalmente en:

```text
~/.codewolf/settings.json
```

```json
{
  "projectContextEnabled": true,
  "verifiedCommitsEnabled": true
}
```

Pueden activarse o desactivarse de forma independiente en cualquier momento desde `/config`.

## Terminal y proveedores compatibles

La herramienta de terminal ejecuta Bash desde el directorio activo del proyecto en todos los sistemas. El agente debe usar rutas relativas y no anteponer un `cd` redundante. Como protección adicional, el runtime normaliza un `cd C:\\... &&` al proyecto actual y convierte rutas diferentes a notación Git Bash (`/c/...`) o WSL (`/mnt/c/...`) cuando corresponde. El resultado informa el directorio inicial, shell y comando realmente ejecutado si hubo normalización.

`basher` devuelve directamente el resultado estructurado del comando. No realiza una segunda llamada al modelo para resumirlo, porque una interrupción del proveedor después de ejecutar la terminal no debe transformar el resultado del proceso en un falso error del agente.

Los adaptadores OpenAI-compatible aceptan varios formatos de error habituales y consideran reintentables los fallos transitorios, incluidos HTTP 408, 425, 429 y 5xx, además de mensajes genéricos como `Upstream request failed`. Se respeta `x-should-retry` cuando el gateway lo proporciona.
