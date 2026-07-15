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
