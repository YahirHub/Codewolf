# 048 — Conectividad resiliente sin dependencia automática del backend Codebuff

# Fecha

2026-07-18

# Objetivo

Desacoplar el flujo normal de Codewolf de los servicios remotos heredados de
Codebuff y distinguir de forma fiable una pérdida general de Internet de un
fallo específico del proveedor de IA. Los prompts enviados sin conexión deben
quedar pendientes y las tareas interrumpidas por un corte real deben continuar
cuando vuelva la conectividad, sin convertir errores HTTP o caídas del provider
en esperas infinitas.

# Archivos importantes modificados

- `common/src/util/internet-connectivity.ts`
- `common/src/util/error.ts`
- `cli/src/hooks/use-connection-status.ts`
- `cli/src/hooks/use-message-queue.ts`
- `cli/src/hooks/use-chat-streaming.ts`
- `cli/src/hooks/use-agent-validation.ts`
- `cli/src/commands/router.ts`
- `cli/src/chat.tsx`
- `cli/src/app.tsx`
- `cli/src/hooks/use-auth-state.ts`
- `cli/src/utils/auth.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/utils/log-shipper.ts`
- `sdk/src/client.ts`
- `sdk/src/validate-agents.ts`
- `sdk/src/impl/model-provider.ts`
- `packages/agent-runtime/src/run-agent-step.ts`
- `packages/agent-runtime/src/llm-api/codebuff-web-api.ts`
- `packages/agent-runtime/src/tools/handlers/tool/read-docs.ts`
- `agents/base2/base2.ts`

# Soluciones implementadas

- El indicador de conexión del CLI dejó de consultar `/api/healthz` de Codebuff
  y ahora comprueba conectividad pública mediante varios endpoints neutrales e
  independientes del proveedor seleccionado.
- Cualquier respuesta HTTP válida de los probes confirma acceso a Internet. Un
  `401`, `429`, `5xx` o error funcional del proveedor nunca se interpreta por sí
  solo como pérdida de Internet.
- Los mensajes de usuario que requieren IA quedan en la cola mientras no exista
  conexión y se procesan automáticamente cuando la conectividad vuelve. Los
  comandos locales del CLI siguen disponibles durante el corte.
- Las peticiones directas al proveedor reintentan de forma indefinida únicamente
  cuando ocurre un error de transporte y una comprobación independiente confirma
  que el equipo realmente está sin Internet. Al volver la red se repite la misma
  petición.
- El ciclo del agente conserva el estado ya completado y vuelve a ejecutar el
  paso interrumpido después de recuperar Internet, evitando reiniciar toda la
  tarea y reduciendo el riesgo de repetir efectos ya finalizados.
- Cuando Internet funciona pero el endpoint del proveedor falla, el error se
  conserva como error del provider y solo usa la política de reintentos acotada
  del adaptador; no entra en el modo de espera por desconexión.
- La validación de agentes se ejecuta siempre localmente. La opción heredada
  `remote: true` se conserva solo por compatibilidad de tipos y ya no realiza
  ninguna llamada remota.
- El conteo de contexto se calcula localmente y ya no usa endpoints remotos de
  Codebuff.
- En ejecución con un proveedor directo, la identidad, el registro de runs y los
  pasos se resuelven localmente y no consultan la base de datos del backend
  heredado.
- `read_docs` consulta Context7 directamente; Gravity Index y las fachadas
  heredadas de búsqueda/conteo remoto quedan deshabilitadas en lugar de llamar
  al backend histórico.
- El envío remoto de logs está desactivado por defecto y solo puede habilitarse
  mediante una opción explícita de compatibilidad.
- Si no existe un proveedor directo configurado, Codewolf falla con un mensaje
  claro para configurar `/login` y `/models`; ya no existe fallback automático
  al backend de Codebuff.

# Decisiones tomadas

- La conectividad se determina contra endpoints públicos ajenos tanto a Codebuff
  como al provider activo. Así una caída de CommandCode, DeepSeek u otro endpoint
  no cambia el estado global a “sin Internet”.
- Solo los errores de transporte (`ECONNRESET`, `ENETUNREACH`, `fetch failed`,
  etc.) pueden disparar una comprobación de Internet. Las respuestas HTTP del
  proveedor se consideran respuestas del proveedor y conservan su semántica.
- La cola offline y el estado de una tarea activa viven en memoria durante el
  proceso actual. Cerrar Codewolf termina esa ejecución; esta implementación no
  serializa procesos activos para reanudarlos después de reiniciar el CLI.
- Un timeout de stream con Internet disponible se presenta como timeout del
  proveedor o de la ruta específica hacia él, no como una caída general de red.
- Los endpoints y módulos heredados necesarios para funciones explícitas de
  compatibilidad del SDK pueden seguir existiendo en el árbol, pero el flujo
  interactivo normal con providers directos no los consulta automáticamente.

# Problemas encontrados

- El estado `Conectando...` medía la disponibilidad de Codebuff y no la conexión
  real a Internet, por lo que podía mostrar desconexión aunque CommandCode
  estuviera disponible.
- Cada prompt podía quedar bloqueado antes de llegar al provider por una
  validación remota de agentes contra Codebuff.
- Un error de red de esa validación podía filtrarse de la interfaz y cancelar el
  envío silenciosamente.
- El runtime todavía conservaba caminos automáticos para conteo remoto de tokens,
  documentación, Gravity Index y tracking de runs.
- Los errores de transporte del provider no distinguían entre una caída general
  de Internet y un endpoint concreto inaccesible.

# Pendientes

- Ejecutar la suite completa con Bun en Windows y confirmar el compilado binario.
- Probar manualmente una desconexión física durante una respuesta de CommandCode,
  durante un tool call y antes de enviar un prompt; verificar que la tarea se
  reanuda al restablecer la red.
- Mantener cualquier integración heredada de Codebuff como función explícita y
  no automática mientras exista compatibilidad pública del SDK.

# Próximos pasos

Ejecutar las pruebas enfocadas de conectividad, cola, cliente, provider y
validación; después ejecutar `bun run tests` y `bun run build:binary` en el
entorno Windows de desarrollo.
