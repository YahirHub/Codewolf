# 053 — Compactación manual aislada

# Fecha

2026-07-20

# Objetivo

Corregir `/compact` para que funcione como una operación interna de compactación y no como una tarea normal enviada al agente orquestador.

# Decisiones

- Reutilizar el modelo y provider activos.
- Ejecutar `/compact` sin herramientas, subagentes, `handleSteps`, step prompt ni instrucciones normales del agente.
- No incluir el literal `/compact` en el historial enviado al modelo; usar una instrucción interna dedicada para generar únicamente el resumen de continuación.
- Conservar exactamente el historial anterior si el modelo devuelve un resumen vacío.
- Mantener la auto-compactación sin cambios: Base2 sigue ejecutando `context-pruner` internamente con `includeToolCall: false` y el umbral configurado.

# Archivos modificados

- `packages/agent-runtime/src/run-agent-step.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `agents/__tests__/base2.test.ts`
- `contexto/000-contexto-maestro.md`

# Validación

- Se añadieron regresiones para comprobar que `/compact` no ejecuta `handleSteps`, no expone herramientas ni subagentes y no envía el literal `/compact` al provider.
- Se añadió una regresión que confirma que la auto-compactación continúa como paso interno `context-pruner` con `includeToolCall: false`.
- Los archivos TypeScript modificados pasan validación sintáctica con esbuild.
