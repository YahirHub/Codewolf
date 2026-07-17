# Corrección definitiva del error cíclico en el segundo turno

## Síntoma reproducido

1. El usuario enviaba una pregunta sencilla y recibía respuesta.
2. Al enviar la siguiente solicitud —especialmente una que podía usar `write_file`, `run_terminal_command` u otra herramienta— aparecía:

```text
JSON.stringify cannot serialize cyclic structures.
```

3. Después del primer fallo, cualquier mensaje posterior repetía el mismo error.

## Causa real

El runtime guardaba en `AgentState.toolDefinitions` las instancias vivas de los esquemas Zod pertenecientes a las herramientas. Algunos esquemas recursivos o `lazy` conservan referencias internas a padres/definiciones y forman un grafo circular.

La primera solicitud podía completarse porque todavía no era necesario clonar el estado anterior. En el segundo turno, el SDK recibía ese estado como `previousRun` y `applyOverridesToSessionState()` intentaba convertirlo a JSON, provocando el error antes de ejecutar la nueva solicitud.

Además, la respuesta final `prompt-response` devolvía directamente el mismo objeto mutable del runtime. Esto permitía que un estado cíclico escapara incluso cuando existían utilidades de clonado seguro en otros caminos.

## Corrección

- Los esquemas de herramientas se convierten a JSON Schema plano antes de almacenarse en `AgentState`.
- La conversión cubre esquemas Zod recursivos y esquemas JSON procedentes de integraciones externas.
- El SDK normaliza el `SessionState` en el límite de `prompt-response` antes de devolverlo al editor.
- Los caminos de error, cancelación y continuación también devuelven estados serializables.
- Los proveedores personalizados usan conteo local de tokens y no consultan el endpoint de conteo de Codebuff.
- Se conserva compatibilidad con sesiones antiguas: cualquier rama circular heredada se reemplaza por `[Circular]`.

## Prueba de regresión

Se agregó una prueba completa de dos turnos que reproduce la secuencia:

1. `¿Qué eres?`
2. `Crea una carpeta llamada pruebas y dentro crea un archivo JavaScript.`

El primer turno incluye deliberadamente un esquema cíclico de `write_file`. La prueba verifica que:

- el primer resultado puede pasarse por `JSON.stringify`;
- el segundo turno recibe el estado normalizado;
- la conversación continúa sin error;
- el segundo resultado también es JSON válido.
