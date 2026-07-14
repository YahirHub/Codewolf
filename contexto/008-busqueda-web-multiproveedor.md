# 008 — Búsqueda web multiproveedor

## Objetivo

Separar la búsqueda web del backend original e incorporar al CLI de Codewolf el sistema multiproveedor analizado en `coding-agent`, adaptándolo a la persistencia global `~/.codewolf` y a la interfaz OpenTUI actual.

## Proveedores soportados

- Tavily
- Brave Search
- Exa
- Linkup
- Firecrawl
- SerpApi
- Zenserp

## Decisiones de arquitectura

1. `web_search` se ejecuta localmente mediante clientes REST por proveedor.
2. No se llama a `/api/v1/web-search` durante el flujo activo.
3. Las respuestas se normalizan antes de regresar al agente.
4. El primer motor es el predeterminado; los demás se usan como respaldo en el orden elegido.
5. Timeout, límites, errores HTTP, JSON inválido o resultados vacíos activan el siguiente respaldo.
6. Un motor sin clave siempre aparece como `INACTIVO` y nunca se intenta usar.
7. No se leen credenciales desde `.env`; toda configuración es explícita e interactiva.
8. Desarrollo y binario comparten `~/.codewolf/search.json` y `~/.codewolf/search-auth.json`.
9. Las API keys nunca deben entrar al historial, mensajes, trazas ni logs.
10. Si el predeterminado queda inactivo, se reasigna el primer respaldo disponible.

## Interfaz

El comando editor-only `/setup-search`, con alias `/search-setup` y `/search`, abre una pantalla donde se puede:

- Ver los siete proveedores, incluso los no configurados.
- Agregar, reemplazar o eliminar claves.
- Habilitar o deshabilitar motores.
- Elegir el predeterminado.
- Reordenar respaldos.
- Probar una conexión individual.
- Probar todos los motores configurados y guardar el último estado.

## Persistencia

```text
~/.codewolf/search.json
~/.codewolf/search-auth.json
```

`search.json` no contiene secretos. `search-auth.json` contiene únicamente las claves y debe permanecer ignorado por Git.

## Validaciones

- Almacenamiento separado de configuración y credenciales.
- Estado inactivo sin clave.
- Reasignación del motor predeterminado.
- Fallback por HTTP 429 y por errores sucesivos.
- Adaptadores y autenticación de los siete proveedores.
- Normalización uniforme de resultados.
- Ausencia de claves en los resultados devueltos.
- Typecheck de `common` y `cli`.

## Limitación heredada

El typecheck completo de `packages/agent-runtime` sigue encontrando dos pruebas que importan `agents-graveyard/researcher/researcher`, directorio que no forma parte del ZIP base. Este problema es previo y no pertenece al sistema de búsqueda.
