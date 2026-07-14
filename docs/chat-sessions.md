# Sesiones, nombres y transferencias de chats

## Renombrar una sesión

`/rename` abre un campo interactivo con el nombre actual. También acepta un nombre
directo, por ejemplo:

```text
/rename Migración de autenticación
```

El nombre se guarda en `chat-meta.json`, aparece en `/history` y no modifica el
identificador técnico ni el contenido de la conversación. Los nombres se
normalizan a una sola línea y tienen un máximo de 120 caracteres.

## Exportar

`/export` abre una pantalla con una ruta sugerida. El formato predeterminado es
JSONL (`.jsonl`): una cabecera, un registro por mensaje y un registro final con
el estado del agente. Este formato permite inspeccionar archivos grandes por
líneas y detectar con precisión una línea dañada.

La exportación contiene:

- nombre visible de la sesión;
- fecha de exportación;
- proyecto y sesión de origen;
- mensajes serializables;
- estado necesario para continuar el agente.

No copia API keys guardadas, credenciales de búsqueda ni archivos externos. Sí
conserva cualquier texto, resultado de herramienta o fragmento de archivo que ya
forme parte del chat o del estado del agente, por lo que la exportación debe
tratarse como información sensible. Las rutas pueden escribirse entre comillas
cuando contienen espacios.

## Importar

`/import` solicita la ruta, valida el archivo y muestra un resumen antes de pedir
confirmación. La importación crea un identificador de chat nuevo dentro del
proyecto actual; nunca sobrescribe la conversación de origen ni otra sesión.

Cuando el proyecto de origen es distinto, la pantalla lo advierte porque el
estado del agente puede hacer referencia al contexto anterior. El usuario puede
cancelar antes de importar. El formato JSON de una versión preliminar también se
acepta por compatibilidad, pero las nuevas exportaciones se escriben en JSONL.

## Persistencia

Los chats siguen almacenándose en:

```text
~/.codewolf/projects/<proyecto>/chats/<chat-id>/
```

Cada chat puede contener:

```text
chat-messages.json
run-state.json
chat-meta.json
```
