# 010 - Corrección de investigadores web bloqueados

## Problema observado

Después de completar una primera búsqueda, una investigación posterior podía dejar dos tarjetas idénticas de `researcher-web` en estado `running` y el turno no avanzaba.

## Causas encontradas

1. Los marcadores temporales de la interfaz se emparejaban únicamente por tipo de agente. Cuando varios investigadores del mismo tipo arrancaban fuera de orden, una tarjeta podía asociarse con el prompt incorrecto.
2. Solicitudes duplicadas exactas dentro de `spawn_agents` se ejecutaban más de una vez.
3. `executeSubagent` emitía `subagent_finish` únicamente en la ruta exitosa. Un error o stream detenido podía dejar la tarjeta en ejecución permanentemente.
4. Los subagentes no tenían un límite total de ejecución; un proveedor que no cerrara el stream bloqueaba `Promise.allSettled` indefinidamente.
5. `researcher-web` exigía leer al menos tres páginas incluso para hechos sencillos, aumentando llamadas y probabilidad de ciclos.

## Solución

- Emparejar marcadores por tipo y prompt normalizado, con fallback por tipo.
- Deduplicar solicitudes exactas en runtime y en la representación visual.
- Mantener un resultado por índice original para cerrar correctamente todos los marcadores del tool call.
- Ejecutar `researcher-web` con límite de 120 segundos y los demás subagentes con límite defensivo de 10 minutos.
- Usar un `AbortController` aislado por subagente para no cancelar el turno principal.
- Suprimir eventos tardíos después de un timeout.
- Emitir `subagent_finish` desde `finally` en éxito, error, cancelación y timeout.
- Cerrar marcadores huérfanos cuando finaliza el stream principal.
- Simplificar el protocolo de investigación: una fuente oficial basta para datos simples; varias fuentes solo cuando el tema lo requiere.

## Archivos principales

- `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts`
- `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts`
- `cli/src/hooks/stream-state.ts`
- `cli/src/utils/spawn-agent-matcher.ts`
- `cli/src/utils/sdk-event-handlers.ts`
- `agents/researcher/researcher-web.ts`

## Regresión protegida

Las pruebas cubren:

- Deduplicación de investigadores idénticos.
- Conservación del mapeo de índices originales.
- Diferenciación de investigadores del mismo tipo por prompt.
- Eventos de inicio recibidos fuera de orden.
- Cierre de marcadores huérfanos al finalizar el stream.
