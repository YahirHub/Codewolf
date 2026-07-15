# Agents and Tools

## Agents

- Prompt/programmatic agents live in `.agents/` (programmatic agents use `handleSteps` generators).
- Generator functions execute in a sandbox; agent templates define tool access and subagents.

### Generic `/agent` shortcut

`/agent` inserts `@Agent ` and invokes the bundled generic agent. Its public ID and display name are model-neutral. The agent inherits the provider/model already active in the CLI through `/models`; it has no per-agent selector or persistent model override.

The template keeps an internal backend fallback for installations without a custom provider, but direct-provider mode ignores that fallback and sends the request to the globally selected OpenAI-compatible model.

### Shell Shims

Direct commands without `codebuff` prefix:

```bash
codebuff shims install codebuff/base-lite@1.0.0
eval "$(codebuff shims env)"
base-lite "fix this bug"
```

## Tools

- Tool definitions live in `common/src/tools` and are executed via the SDK helpers + agent-runtime.

## Idempotent subagent execution

OpenAI-compatible gateways may replay a tool call, restart tool-call indexes, or emit the same logical agent request once as a direct agent tool and again through `spawn_agents`. Codewolf treats a subagent request as the tuple of normalized agent type, prompt, and params.

Within one model response, each semantic request is executed once. Replayed provider IDs, duplicate entries in one `spawn_agents` array, and later equivalent tool calls are discarded before execution. The TUI also maps the provisional `spawn_agents` card to the real `subagent_start` event so it cannot render both as separate researchers.

Requests with different prompts or params remain independent. This allows several `researcher-web` agents to run concurrently for different products while suppressing only true duplicates.

## Modo PLAN

PLAN se selecciona desde el control de modos del editor; no existe un comando
`/plan` independiente. `base2-plan` está restringido por capacidades: conserva
lectura de archivos, búsqueda, skills, preguntas y agentes de investigación o
razonamiento, pero no recibe herramientas de mutación, terminal, `write_todos`,
agentes editores, tmux ni el agente genérico.

El plan final debe estar encerrado en `<PLAN>...</PLAN>` y basarse en contexto
realmente inspeccionado. Debe identificar objetivo, arquitectura y convenciones,
decisiones, pasos de implementación, archivos afectados, validación concreta,
riesgos y reversión. La tarjeta permite revisarlo manteniendo PLAN o aprobarlo
para DEFAULT, MAX o LITE. La aprobación ordena crear `write_todos` antes de la
primera edición.

## Observación de mutaciones para `/rewind`

El SDK expone callbacks best-effort antes y después de `write_file`,
`str_replace` y `apply_patch`. El CLI los usa para guardar snapshots por chat.
Esta observación vive por debajo de la orquestación, por lo que también cubre
ediciones de subagentes. Un error del sistema de checkpoints nunca puede
cancelar una edición ni cambiar su resultado.

Las herramientas de terminal y las herramientas personalizadas no se consideran
mutaciones rastreables porque el SDK no puede determinar de forma confiable qué
archivos alteraron. No amplíes esa promesa sin una estrategia verificable de
detección y conflictos.
