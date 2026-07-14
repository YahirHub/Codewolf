# 015 — Estadísticas locales de tokens

# Fecha

2026-07-13

# Objetivo

Recuperar `/usage` con un propósito exclusivamente técnico: medir tokens usados
por Codewolf aunque un proveedor personalizado no entregue métricas, sin precios,
créditos, saldos, cuotas ni dependencias comerciales.

# Decisiones tomadas

- La medición se realiza en el límite común de llamadas LLM, no en cada agente.
- Se usa la cifra del proveedor cuando informa entrada y salida.
- Si falta una parte, Codewolf la calcula y marca la llamada como `mixed`.
- Si el proveedor no informa nada, entrada y salida se calculan localmente y la
  llamada se marca como `local`.
- `/usage` es una pantalla interactiva y no agrega mensajes al chat.
- La persistencia es JSONL para mantener el MVP simple e inspeccionable.
- No se agregaron tokenizers ni bases de datos nuevas; se reutiliza el contador
  ya instalado en `agent-runtime`.
- No se calculan precios ni se intenta inferir cuotas del proveedor.

# Arquitectura actual

```text
Proveedor / AI SDK
        ↓
sdk/src/impl/llm.ts
        ↓ normaliza o calcula
TokenUsageEvent
        ↓ callback del SDK
cli/src/utils/token-usage.ts
        ↓
~/.codewolf/usage.jsonl
        ↓
/usage → token-usage-screen.tsx
```

La misma ruta cubre al agente principal, subagentes, llamadas en streaming,
llamadas no streaming y respuestas estructuradas.

# Librerías usadas

- Contador existente `gpt-tokenizer` expuesto por `agent-runtime`.
- APIs nativas `fs` y `path`.
- React y OpenTUI ya instalados.

No se agregaron dependencias ni se modificó `bun.lock`.

# Archivos importantes modificados

- `common/src/types/token-usage.ts`
- `common/src/types/contracts/llm.ts`
- `sdk/src/impl/token-usage.ts`
- `sdk/src/impl/llm.ts`
- `sdk/src/impl/agent-runtime.ts`
- `sdk/src/run.ts`
- `packages/agent-runtime/src/prompt-agent-stream.ts`
- `packages/agent-runtime/src/run-agent-step.ts`
- `cli/src/utils/token-usage.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/components/token-usage-screen.tsx`
- `cli/src/commands/usage.ts`
- `scripts/cleanup-commercial-cli.py`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/chat.tsx`
- `docs/token-usage.md`

# Problemas encontrados

- El antiguo `/usage` estaba relacionado con créditos comerciales y había sido
  eliminado correctamente de esta edición.
- No todos los endpoints OpenAI-compatible devuelven `usage`.
- Contar únicamente el mensaje del usuario ocultaría el consumo del historial,
  herramientas, skills y contexto de archivos.
- Contar base64 de imágenes como texto produciría cifras absurdas.
- El typecheck heredado completo de `agent-runtime` referencia dos archivos
  ausentes en `agents-graveyard/researcher`.

# Soluciones implementadas

- `/usage` fue reintroducido como estadística local, sin llamadas a endpoints de
  facturación.
- El script de limpieza comercial dejó de eliminar `usage.ts`; ahora conserva el
  comando técnico y solo retira archivos comerciales realmente obsoletos.
- Se normaliza el cuerpo final de la solicitud y se calcula con el contador ya
  existente cuando no hay métricas del proveedor.
- Las URL de datos multimedia se resumen y se marca la medición como aproximada.
- Se registra únicamente metadata numérica y técnica.
- El archivo se compacta al superar 4 MiB, conservando 90 días y 10 000 eventos.
- La pantalla permite inspección por sesión, proyecto, agente y modelo, además de
  limpieza local con confirmación.

# Pendientes

- Registrar consumo parcial de solicitudes que terminan en error o cancelación
  cuando el proveedor entregue métricas antes de cerrar el stream.
- Evaluar tokenizers específicos por modelo solo si la diferencia observada
  justifica una dependencia adicional.
- Evaluar una vista por período cuando exista suficiente historial real.

# Próximos pasos

1. Probar `/usage` con un proveedor que entregue métricas.
2. Probarlo con un proveedor que no entregue `usage`.
3. Ejecutar una tarea con `researcher-web` y confirmar el desglose por agente.
4. Comparar una cifra local con la cifra oficial de un proveedor conocido para
   documentar el margen aproximado.

# Validaciones realizadas

- Typecheck aprobado en `common`, `sdk`, `packages/llm-providers` y `cli`.
- Typecheck productivo de `packages/agent-runtime` aprobado excluyendo pruebas.
- Suite completa del SDK: 499 pruebas aprobadas, 0 fallos.
- Pruebas enfocadas de cálculo, persistencia y comando: 89 aprobadas, 0 fallos.
- Suite de `common`: 505 aprobadas y un fallo heredado en la equivalencia JSON
  Schema de un `z.preprocess`, no relacionado con este cambio.
- Suite completa del CLI: 2530 aprobadas y fallos heredados en pruebas que aún
  esperan funciones comerciales, textos antiguos o variables de Infisical.
- Generación de agentes, build del SDK y build del binario Linux aprobados.
- `codewolf --version` y `codewolf --help` ejecutados correctamente.
- El typecheck completo heredado de `agent-runtime` conserva dos imports ausentes
  de `agents-graveyard/researcher`, carpeta no incluida en el proyecto base.
