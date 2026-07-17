# Corrección de referencias JSON cíclicas en proveedores personalizados

## Problema

Una primera respuesta simple podía completarse, pero una solicitud posterior que utilizara herramientas podía fallar con:

```text
JSON.stringify cannot serialize cyclic structures.
```

La causa era que algunas entradas o resultados de herramientas conservaban referencias circulares de objetos en memoria. En el siguiente turno, el historial se transformaba al formato OpenAI-compatible y se intentaba serializar con `JSON.stringify` estricto.

## Solución

- Se añadió una utilidad JSON compartida que reemplaza únicamente referencias circulares por el marcador estable `[Circular]`.
- Los valores `bigint`, que tampoco existen en JSON, se conservan como cadenas decimales.
- Las entradas de herramientas se normalizan antes de ejecutarse, almacenarse y reproducirse.
- Los resultados JSON de herramientas integradas, personalizadas y MCP se normalizan antes de entrar al historial.
- La conversión OpenAI-compatible utiliza serialización segura tanto para `tool_calls[].function.arguments` como para mensajes `tool`.
- El cuerpo completo enviado al proveedor también se normaliza como última barrera de seguridad.
- Se evitó copiar accidentalmente el contenido original del mensaje de herramienta dentro de cada resultado convertido.

## Comportamiento esperado

El contenido útil no se descarta. Solo la rama que apunta nuevamente a uno de sus ancestros se convierte en:

```json
"[Circular]"
```

Una referencia compartida entre ramas independientes no se considera un ciclo y se serializa normalmente en ambas ramas.

## Cobertura

Se agregaron pruebas para:

- ciclos en entradas de herramientas;
- ciclos en resultados JSON;
- referencias compartidas no cíclicas;
- valores `bigint`;
- conversión del historial Codebuff;
- una segunda solicitud real en streaming mediante un proveedor OpenAI-compatible.
