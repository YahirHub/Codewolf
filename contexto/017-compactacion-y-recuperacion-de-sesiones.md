# 017 — Compactación de contexto y recuperación de sesiones dañadas

# Fecha

2026-07-14

# Objetivo

Evitar que una conversación larga desborde la ventana del modelo, exponer
`/compact` como comando real del CLI y permitir que una sesión afectada por
mensajes históricos con `role` o `content` nulos vuelva a continuar sin borrar
el chat.

# Decisiones tomadas

- Conservar el agente determinista existente `context-pruner`; no crear un
  segundo sistema de memoria ni depender de una llamada externa adicional.
- Interpretar `maxContextLength` como el umbral de compactación, calculado al
  90 % del contexto máximo del modelo.
- Permitir declarar el contexto manualmente con `modelo=tokens` y obtenerlo de
  campos comunes de `GET /models` cuando el proveedor lo publique.
- Mantener compatibilidad con configuraciones antiguas: 1 000 000 tokens para
  IDs que contienen `deepseek` y 400 000 para otros modelos personalizados si
  no hay un valor explícito o descubierto.
- Registrar `/compact` en el enrutador del CLI y conservar el historial si el
  modelo devuelve un resumen vacío.
- Tratar los metadatos OpenAI-compatible como datos no confiables: pueden
  agregar extensiones, pero nunca sobrescribir campos obligatorios del
  protocolo.
- Normalizar el historial persistido antes de reanudarlo. Reparar entradas
  compatibles y eliminar mensajes irreparables o tool calls/resultados
  huérfanos.

# Arquitectura actual

1. `cli/src/utils/custom-providers.ts` guarda `maxContextTokens` por modelo,
   calcula el 90 % y lo entrega al agente base activo.
2. `cli/src/utils/create-run-config.ts` inyecta `maxContextLength` únicamente en
   agentes Base2, evitando cambiar el contrato de agentes personalizados.
3. `agents/base2/base2.ts` conserva umbrales serializados para modelos
   integrados: 225 000 para Kimi, 360 000 para el valor genérico de 400 000 y
   900 000 para DeepSeek.
4. `agents/context-pruner.ts` se ejecuta antes de cada paso, compara el conteo
   informado por la petición anterior con una estimación conservadora del
   historial actual y reemplaza la historia antigua por una memoria acotada
   cuando se supera el umbral. Esto cubre también un prompt nuevo muy grande.
5. `/compact` envía el prompt exacto que ya reconoce
   `packages/agent-runtime/src/system-prompt/prompts.ts`; al terminar,
   `run-agent-step.ts` reemplaza el historial por el resumen.
6. Antes de enviar mensajes a un proveedor, `common/src/util/messages.ts`
   repara historiales heredados y el adaptador OpenAI-compatible filtra claves
   reservadas de los metadatos.
7. `sdk/src/run.ts` deriva el mismo umbral del 90 % cuando un consumidor usa
   directamente `customProvider.maxContextTokens`; `sdk/src/run-state.ts` aplica
   la normalización al cargar un `previousRun`, por lo que una sesión dañada se
   corrige también en su siguiente guardado.

# Librerías usadas

- TypeScript.
- Zod ya incluido para validar `providers.json`.
- Utilidades existentes del monorepo; no se agregaron dependencias.

# Archivos importantes modificados

- `agents/base2/base2.ts`
- `agents/context-pruner.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/utils/custom-providers.ts`
- `cli/src/components/provider-login-screen.tsx`
- `cli/src/utils/create-run-config.ts`
- `cli/src/hooks/use-send-message.ts`
- `common/src/types/custom-provider.ts`
- `common/src/util/messages.ts`
- `packages/agent-runtime/src/run-agent-step.ts`
- `packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages.ts`
- `sdk/src/run.ts`
- `sdk/src/run-state.ts`
- Pruebas unitarias relacionadas en `agents/`, `cli/`, `common/`,
  `packages/llm-providers/` y `sdk/`.
- `README.md`, `AGENTS.md`, `docs/custom-providers.md` y
  `docs/chat-sessions.md`.

# Problemas encontrados

- La compactación automática ya existía, pero los agentes Base2 utilizaban
  valores fijos de 250 000 o 400 000 como si fueran el umbral final; no se
  calculaba el 90 % del modelo seleccionado.
- El runtime ya reconocía el texto `compact`, pero `/compact` no estaba
  registrado en la superficie de comandos y podía terminar como comando
  desconocido.
- El esquema de proveedores no almacenaba el contexto máximo del modelo.
- El adaptador OpenAI-compatible expandía metadatos después de `role`,
  `content`, `tool_calls` y `tool_call_id`. Un proveedor podía devolver claves
  reservadas con `null` y sobrescribir los campos correctos al reconstruir una
  petición posterior. Esto explica errores como
  `params.messages[165].content expected string/array, received null`.
- Un `run-state.json` ya guardado con entradas inválidas volvía a fallar en cada
  respuesta, aunque el mensaje nuevo fuera correcto.

# Soluciones implementadas

- Umbral automático al 90 % para modelos integrados y personalizados.
- Sintaxis manual `modelo=tokens`, conservación al editar y descubrimiento de
  cinco nombres comunes de campo de contexto.
- Comando `/compact` visible, encolable durante streaming y ejecutable también
  como `compact` implícito.
- Protección contra resumen vacío para no perder una conversación completa.
- Lista de claves reservadas filtrada en mensajes, partes de contenido, tool
  calls y tool results antes de expandir metadatos del proveedor.
- Sanitización de historial que:
  - convierte contenido de texto heredado a partes válidas;
  - repara resultados de herramienta nulos como salida vacía;
  - infiere el rol `tool` cuando conserva identificadores válidos;
  - descarta roles/contenidos irreparables;
  - elimina tool calls y tool results que quedaron huérfanos.
- Estimación local del historial actual para no depender exclusivamente del
  contador atrasado del proveedor cuando acaba de entrar un prompt muy grande.
- Pruebas para cálculo del 90 %, descubrimiento de contexto, comando registrado,
  prompt nuevo con contador atrasado, metadatos reservados y recuperación de
  `RunState`.

# Validación realizada

- Transpilación sintáctica con TypeScript 5.8.3 de todos los archivos TS/TSX
  modificados: correcta.
- Revisión estática aislada con `tsc --noResolve`; no mostró errores locales
  nuevos después de excluir imports/tipos ausentes por no tener dependencias.
- No fue posible ejecutar Bun ni la suite completa porque el ZIP no incluye
  `node_modules`, Bun no está instalado en el entorno y la descarga falló por
  falta de resolución DNS.

Comandos pendientes en un entorno con Bun 1.3.14:

```bash
bun install --frozen-lockfile
bun test agents/__tests__/base2.test.ts
bun test agents/__tests__/context-pruner.test.ts
bun test cli/src/commands/__tests__/router-input.test.ts
bun test cli/src/utils/__tests__/custom-providers.test.ts
bun test cli/src/__tests__/unit/create-run-config.test.ts
bun test common/src/util/__tests__/messages.test.ts
bun test packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages.test.ts
bun test sdk/src/__tests__/run-state-circular-tools.test.ts
bun run --cwd ./cli typecheck
bun run build:sdk
```

# Pendientes

- Verificar con una API DeepSeek real que `/models` publique uno de los campos
  soportados; si no lo hace, mantener `deepseek-...=1000000` explícito.
- Probar una copia real de la sesión que produjo el mensaje 165 y confirmar que
  el siguiente turno reescribe el `run-state.json` ya normalizado.
- Considerar en un cambio separado una tabla mantenida de ventanas conocidas
  para más modelos integrados, en vez del valor genérico de 400 000.

# Próximos pasos

1. Instalar dependencias con Bun 1.3.14 y ejecutar los comandos anteriores.
2. Abrir el chat afectado y enviar un mensaje normal; no borrar la sesión.
3. Ejecutar `/compact` manualmente y comprobar que la siguiente respuesta
   conserva decisiones y archivos importantes.
4. Revisar `~/.codewolf/providers.json` y confirmar que el modelo activo tiene
   `maxContextTokens` correcto o editarlo desde `/providers` con
   `modelo=tokens`.
