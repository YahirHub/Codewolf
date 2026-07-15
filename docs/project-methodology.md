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

Si `contexto/` todavía no existe, el agente recibe instrucciones para crearlo únicamente después de un cambio importante. La estructura inicial recomendada es:

```text
contexto/
├── 000-contexto-maestro.md
└── 001-<cambio-importante>.md
```

Cada documento numerado debe registrar fecha, objetivo, decisiones, arquitectura, librerías, archivos modificados, problemas, soluciones, pendientes y próximos pasos. Nunca debe contener credenciales o secretos.

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

Si el usuario confirma que funciona:

1. Codewolf vuelve a consultar Git y descarta rutas que el agente tocó pero dejó finalmente sin cambios.
2. Verifica que los archivos elegibles no hayan cambiado desde que terminó el agente.
3. Comprueba que no existan cambios preparados previamente en Git.
4. Genera `Summary` y `Description` en español.
5. Repite las comprobaciones después de generar el mensaje, prepara solamente los archivos elegibles y verifica el staging exacto.
6. Crea el commit y muestra su hash y mensaje.

Para no mezclar trabajo ajeno, se excluyen automáticamente:

- archivos que ya estaban modificados antes del turno;
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
