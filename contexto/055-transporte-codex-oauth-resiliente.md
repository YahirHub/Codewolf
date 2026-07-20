# 055 - Transporte Codex OAuth resiliente

## Objetivo

Corregir bloqueos y esperas indefinidas al usar modelos Codex mediante la suscripción ChatGPT/OAuth sin cambiar el flujo de proveedores personalizados ni la compactación existente.

## Diagnóstico

El OAuth existente ya seguía el flujo Codex compatible: PKCE con callback local, device code para entornos headless, refresh token y enrutamiento al endpoint `https://chatgpt.com/backend-api/codex/responses`.

El problema principal estaba en el transporte SSE que adapta Responses API al contrato OpenAI-compatible usado internamente por Codewolf:

- no había límites para esperar cabeceras, primer evento o una conexión que quedara silenciosa;
- errores del stream podían ser absorbidos por el adaptador y dejar al consumidor esperando un marcador terminal;
- no se reutilizaba el identificador de sesión para afinidad/cache del backend Codex;
- se enviaban cabeceras antiguas que no son necesarias en SSE;
- la extracción del account id solo contemplaba una forma del JWT.

## Cambios

- Timeout de cabeceras Codex: 20 segundos.
- Timeout del primer evento SSE: 30 segundos.
- Timeout de inactividad del stream: 90 segundos.
- Un reintento acotado durante el arranque para timeouts y HTTP transitorios 408/502/503/504.
- Los errores SSE y streams truncados se propagan; no se silencian.
- Se evita emitir dos terminaciones cuando el backend envía eventos terminales duplicados.
- Se añade `session-id` y `prompt_cache_key` basados en la sesión activa.
- Payload Codex alineado con Responses: `store=false`, `tool_choice=auto`, `parallel_tool_calls=true`, razonamiento con summary automático y verbosity low.
- Cabeceras alineadas con un cliente Codex: `originator`, `User-Agent` y `ChatGPT-Account-ID`.
- Se elimina `OpenAI-Beta: responses=experimental` del transporte SSE.
- Device-code OAuth incluye User-Agent y mantiene el mismo cliente OAuth oficial compatible.
- Account ID soporta claim superior, claim anidado y organización como fallback.

## Compatibilidad

- No cambia providers personalizados como CommandCode.
- No cambia `/compact` ni la auto-compactación.
- No añade WebSocket: se conserva SSE como transporte estable, especialmente en Windows.
- El refresh OAuth existente y su singleflight se mantienen.
- El runner de tests continúa siendo `scripts/test-all.go`.

## Pruebas de regresión añadidas

- Payload Responses con afinidad de sesión.
- Reintento si la conexión abre pero no emite el primer evento.
- Reintento de 503 antes del streaming.
- Propagación de stream truncado.
- Corte de un stream que queda inactivo.
- Una sola marca `[DONE]` ante terminales duplicados.
- Extracción de account id desde las formas actuales del JWT.
