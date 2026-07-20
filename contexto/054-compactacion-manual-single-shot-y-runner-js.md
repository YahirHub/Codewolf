# 054 - Compactación manual single-shot y runner de pruebas JavaScript

## Objetivo

Corregir la regresión de `/compact` donde una respuesta del provider que incluyera un tool call inesperado podía provocar iteraciones adicionales hasta agotar `stepsRemaining`, devolviendo el mensaje genérico de pausa en vez del resumen de compactación.

## Cambios

- `/compact` termina siempre después de una única llamada al modelo.
- Los tool calls inesperados emitidos durante la compactación no provocan una segunda iteración.
- El steering no se drena ni se mezcla dentro de la operación interna `/compact`.
- Si existe resumen, únicamente ese resumen reemplaza el historial.
- Si la primera respuesta no contiene resumen, se conserva exactamente el historial original.
- Se agregan regresiones que verifican una sola llamada LLM tanto con resumen como con respuesta vacía.

## Runner de validación

- Se elimina `scripts/test-all.go`.
- Se agrega `scripts/test-all.js`, ejecutado con Bun.
- El runner intenta todos los checks aunque alguno falle.
- Los errores se acumulan y se imprimen juntos al final.
- Cada error muestra comando y código de salida exacto.
- El runner termina con código `0` si todo pasa y `1` si falla uno o más checks.
