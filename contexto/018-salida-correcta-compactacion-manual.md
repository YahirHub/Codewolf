# 018 — Salida correcta después de la compactación manual

# Fecha

2026-07-14

# Objetivo

Corregir el falso error `No response from agent` que aparecía después de que
`/compact` generaba correctamente el resumen y sustituía el historial de la
sesión.

# Decisiones tomadas

- Aplicar la sustitución del historial una sola vez, al terminar por completo el
  turno del agente, no dentro de cada llamada individual a `runAgentStep`.
- Separar el estado persistido de la salida pública del comando: el estado
  compactado conserva únicamente una memoria de rol `user`, mientras que la
  salida `lastMessage` se construye directamente con el resumen generado.
- Conservar el resumen textual no vacío más reciente del turno para soportar
  agentes que necesiten más de un paso antes de finalizar.
- Si el modelo no produce texto, restaurar exactamente el historial existente
  antes de ejecutar `/compact`, retirar el intento fallido y devolver una
  advertencia visible sin marcar la sesión como error.

# Arquitectura actual

1. `loopAgentSteps` detecta al inicio si el prompt exacto es `/compact` o
   `compact`.
2. Cada respuesta textual no vacía del turno actualiza el candidato de resumen.
3. Cuando el agente termina:
   - con resumen, sustituye el historial por la memoria condensada y devuelve
     una salida `lastMessage` construida desde ese resumen;
   - sin resumen, restaura una copia profunda del historial anterior y devuelve una
     advertencia no fatal.
4. La extracción genérica mediante `getAgentOutput` continúa sin cambios para
   todos los demás comandos y agentes.

# Librerías usadas

- TypeScript.
- Utilidades existentes `assistantMessage`, `userMessage` y `withSystemTags`.
- No se agregaron dependencias.

# Archivos importantes modificados

- `packages/agent-runtime/src/run-agent-step.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `docs/chat-sessions.md`
- `AGENTS.md`
- `contexto/000-contexto-maestro.md`
- `contexto/018-salida-correcta-compactacion-manual.md`

# Problemas encontrados

- `runAgentStep` sustituía inmediatamente el historial por una sola memoria de
  rol `user` cuando detectaba `/compact`.
- Al finalizar el bucle, `getAgentOutput` buscaba el último turno de rol
  `assistant`. Ese mensaje ya no existía porque la sustitución era intencional,
  por lo que devolvía `No response from agent` aunque el resumen se hubiera
  generado y mostrado correctamente.
- La lógica por paso tampoco cubría bien una compactación que necesitara varias
  respuestas del agente.
- Cuando el resumen era vacío, el intento de compactación podía quedar agregado
  al historial que supuestamente debía conservarse.

# Soluciones implementadas

- Se retiró la sustitución del historial desde `runAgentStep`.
- Se trasladó la finalización de `/compact` a `loopAgentSteps`, después de todos
  los pasos del agente.
- Se agregó una salida exitosa explícita basada en el resumen, evitando depender
  de que la memoria persistida tenga un mensaje `assistant`.
- Se añadió recuperación exacta del historial anterior cuando no existe resumen.
- Se agregaron pruebas para:
  - resumen válido, salida `lastMessage` y estado reducido a una sola memoria;
  - resumen vacío, historial original intacto y advertencia no fatal.

# Validación realizada

- `git diff --check`: correcto.
- Formato Prettier de los archivos modificados: correcto.
- TypeScript del código fuente de `packages/agent-runtime`, excluyendo pruebas:
  correcto.
- Bun 1.3.14, pruebas enfocadas de compactación manual: 2 aprobadas, 0 fallidas.
- La ejecución completa de `loop-agent-steps.test.ts` conserva varios timeouts y
  contadores compartidos ajenos a este cambio. Se reprodujeron también en el
  commit padre `719bfdb`; las dos pruebas nuevas pasan de forma aislada y cubren
  los caminos de resumen válido y resumen vacío.

Comandos ejecutados:

```bash
bun test packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts \
  -t "manual compaction" --timeout 20000
bun x tsc --noEmit -p packages/agent-runtime/tsconfig.source-check.json
bun x prettier --check <archivos modificados>
```

# Pendientes

- Probar `/compact` en una conversación real con varias llamadas de herramienta
  y confirmar que el siguiente mensaje continúa desde la memoria reducida.

# Próximos pasos

1. Compilar el binario actualizado.
2. Abrir la sesión que mostró `No response from agent`.
3. Ejecutar nuevamente `/compact`.
4. Confirmar que desaparece el banner rojo y que el siguiente mensaje conserva
   las decisiones resumidas.
