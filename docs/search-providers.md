# Motores de búsqueda web

Codewolf ejecuta la herramienta nativa `web_search` directamente desde el CLI. No depende del endpoint privado de búsqueda del proyecto original ni consume créditos del backend de Codebuff.

## Configuración interactiva

Dentro del editor, ejecuta:

```text
/setup-search
```

El asistente siempre muestra estos motores:

1. Tavily
2. Brave Search
3. Exa
4. Linkup
5. Firecrawl
6. SerpApi
7. Zenserp

Un motor sin API key aparece como `INACTIVO`. Guardar una clave lo habilita automáticamente; también puede deshabilitarse sin eliminar su credencial.

El menú permite:

- Configurar, reemplazar o eliminar una API key.
- Habilitar o deshabilitar motores configurados.
- Elegir el motor predeterminado.
- Ordenar los motores de respaldo.
- Probar un motor individual.
- Probar secuencialmente todos los motores configurados.
- Consultar el resultado de la última prueba.

Las claves se capturan en un campo enmascarado y el comando no se agrega al historial del chat.

## Persistencia

Desarrollo y binario usan la misma carpeta global:

```text
~/.codewolf/
├── search.json
└── search-auth.json
```

- `search.json` almacena estados, motor predeterminado, orden de respaldo y resultado de las pruebas.
- `search-auth.json` almacena exclusivamente las API keys.

No se leen claves desde `.env`: un motor solo está configurado cuando su clave fue guardada explícitamente desde `/setup-search`.

## Selección y fallback

La ejecución sigue este orden:

1. Motor predeterminado activo.
2. Motores de respaldo activos según el orden definido.
3. Se detiene en el primer motor que devuelva resultados utilizables.

Codewolf pasa al siguiente motor cuando ocurre cualquiera de estos casos:

- Timeout.
- Error de red.
- HTTP 401, 403, 429, 5xx u otro error de API.
- JSON inválido.
- Respuesta válida sin resultados utilizables.
- Error declarado dentro del payload del proveedor.

Brave mantiene una separación mínima entre solicitudes para respetar sus límites más estrictos. Ante un `429` corto hace un único reintento; si el tiempo indicado es largo, continúa de inmediato con el siguiente respaldo.

Si el motor predeterminado se deshabilita o pierde su clave, Codewolf reasigna automáticamente el primer respaldo activo como predeterminado.

## Formato uniforme

Todos los adaptadores convierten sus respuestas al mismo formato:

```text
Motor: <proveedor>
Consulta: <consulta>

1. [Título](https://ejemplo.com)
   Fecha · Autor
   Fragmento normalizado
```

Esto permite que el agente procese los resultados de la misma forma sin importar qué proveedor completó la búsqueda.

## Seguridad

- Las claves no se incluyen en resultados, errores, logs ni historial del chat.
- Las credenciales están separadas de la configuración general.
- Los archivos se escriben de forma atómica.
- En sistemas compatibles, los archivos privados se crean con permisos `0600` y el directorio con `0700`.
- `search-auth.json` está excluido por `.gitignore`.

## Archivos principales

- `common/src/web-search/search-config.ts`
- `common/src/web-search/search-storage.ts`
- `common/src/web-search/search-runtime.ts`
- `packages/agent-runtime/src/tools/handlers/tool/web-search.ts`
- `cli/src/components/search-setup-screen.tsx`
- `cli/src/commands/search.ts`

## Relación con `researcher-web`

`researcher-web` es un subagente: primero necesita iniciar su propia petición al modelo y después puede llamar a `web_search`. Cuando existe un proveedor de modelos personalizado, el subagente debe recibir exactamente el mismo `customProvider` activo que el agente principal.

Un HTTP 401 producido antes de mostrar una llamada `web_search` pertenece al proveedor del modelo, no a Tavily. Codewolf propaga ahora el proveedor personalizado a todos los subagentes y bloquea cualquier fallback accidental al backend original.

Para validar específicamente Tavily, utiliza **Probar conexión** dentro de `/setup-search`. Esa prueba llama directamente a `https://api.tavily.com/search` usando `Authorization: Bearer <clave>` y no crea ningún subagente.

## Protección contra investigadores bloqueados

Las investigaciones web ejecutadas mediante `researcher-web` tienen una ventana máxima de 120 segundos. Si el modelo o su conexión dejan un stream abierto indefinidamente, Codewolf cancela únicamente ese subagente, devuelve el error al agente principal y continúa el turno sin bloquear toda la interfaz.

La interfaz empareja cada evento de inicio con su marcador temporal usando el tipo **y el prompt**. Esto es importante cuando se ejecutan varios `researcher-web` simultáneamente para preguntas diferentes: los eventos pueden llegar en cualquier orden y ya no se asignan a la tarjeta equivocada.

Además:

- Solicitudes idénticas repetidas dentro del mismo `spawn_agents` se ejecutan una sola vez.
- La interfaz muestra una sola tarjeta para solicitudes duplicadas exactas.
- `subagent_finish` se emite incluso cuando el investigador falla o excede el tiempo.
- Los marcadores temporales huérfanos se cierran al finalizar el stream principal.
- Para preguntas factuales sencillas, `researcher-web` utiliza una fuente oficial suficiente en lugar de exigir tres lecturas y entrar en ciclos innecesarios.
