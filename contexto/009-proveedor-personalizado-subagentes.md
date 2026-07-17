# 009 — Propagación del proveedor personalizado a subagentes

## Problema observado

El agente principal funcionaba con el proveedor configurado mediante `/login`, pero al crear `researcher-web` aparecía un HTTP 401. Tavily estaba correctamente configurado; el fallo ocurría antes de ejecutar `web_search`.

## Causa raíz

`extractSubagentContextParams()` copiaba manualmente las dependencias del runtime al crear un subagente, pero omitía `customProvider`. Como consecuencia:

1. El agente principal usaba el modelo personalizado.
2. `researcher-web` conservaba su modelo de plantilla Gemini.
3. El subagente intentaba comunicarse con el backend original de Codebuff.
4. Sin credenciales válidas del servicio original, el backend respondía 401.

También se omitía `traceWriter`, por lo que las trazas no se conservaban en subagentes.

## Corrección

- Propagar `customProvider` y `traceWriter` en el contexto común de todos los subagentes.
- Usar siempre un identificador interno `local-custom-provider:<id>` como `apiKey` del runtime cuando hay proveedor personalizado activo, incluso si existen credenciales antiguas de Codebuff.
- Bloquear cualquier fallback accidental al backend original cuando exista ese identificador pero falte `customProvider`.
- Añadir pruebas enfocadas para la propagación del contexto y la barrera contra fallback silencioso.

## Resultado esperado

`researcher-web` y cualquier otro subagente usan el mismo proveedor y modelo seleccionados en `/models`. Tavily y los demás motores de búsqueda se ejecutan después desde la herramienta local `web_search`; sus credenciales son independientes de las credenciales del modelo.
