# 047 — Compatibilidad CommandCode con mensajes interrumpidos

# Fecha

2026-07-18

# Objetivo

Evitar que un proveedor personalizado OpenAI-compatible como CommandCode bloquee los turnos posteriores cuando el historial contiene un mensaje `assistant` sin texto, por ejemplo después de una respuesta interrumpida, razonamiento interno o una llamada de herramienta.

# Problema

Codewolf ya reparaba entradas persistidas con `content: null` y protegía los campos reservados frente a metadatos del proveedor. Sin embargo, el formato OpenAI-compatible legítimamente representa los mensajes `assistant` que solo contienen `tool_calls` o `reasoning_content` con `content: ""`. Algunos proxies compatibles convierten ese valor vacío a `null` antes de su validación final y luego rechazan el propio mensaje normalizado con errores sobre `params.messages[n].content`.

# Solución

- Se agregó la opción interna `requireNonEmptyAssistantContent` al adaptador OpenAI-compatible.
- Los proveedores personalizados directos activan esta compatibilidad de forma automática.
- Después de construir y fusionar los mensajes del asistente, cualquier `content` nulo o vacío se reemplaza por un único espacio antes de crear el cuerpo HTTP.
- El backend original de Codewolf y ChatGPT/Codex no cambian de comportamiento.
- Se conserva el saneamiento previo de historiales dañados, tool calls huérfanas y metadatos reservados.

# Archivos modificados

- `packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages.ts`
- `packages/llm-providers/src/openai-compatible/chat/openai-compatible-chat-language-model.ts`
- `packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages.test.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/__tests__/model-provider.test.ts`
- `docs/custom-providers.md`
- `AGENTS.md`

# Validación

- Se añadió una regresión para mensajes `assistant` con razonamiento y tool call sin texto.
- La prueba de proveedor personalizado verifica que el cuerpo HTTP use `content: " "` en un mensaje histórico de tool call.
- El comportamiento estándar del convertidor conserva `content: ""` cuando el modo estricto no está activo.

# Pendiente operativo

Ejecutar la suite completa con Bun y reproducir en CommandCode una conversación previamente interrumpida para confirmar que el siguiente turno continúa sin el error de validación.
