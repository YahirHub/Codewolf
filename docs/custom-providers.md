# Interactive custom providers and model switching

The full Codebuff editor can route all agent requests directly to an OpenAI-compatible API. The selected provider and model apply globally to the main agent and every subagent created during the run.

This feature is configured entirely inside the editor and is not enabled in Freebuff mode.

## No `.env` file is required

The standalone CLI supplies its own safe defaults for inherited public web variables. You can install dependencies and run `bun run dev` without creating `.env` in either the repository root or `cli/`. Explicit environment variables still override the built-in defaults. Analytics is disabled in the fallback configuration.

## Open the editor without an existing login

The full editor opens even on a fresh installation without Codebuff credentials. This makes `/login` available before any provider exists. Sending an agent request still requires either a configured custom provider or valid Codebuff credentials.

## Configure a provider with `/login`

Enter:

```text
/login
```

The editor opens a four-step assistant:

1. **Provider name** — used as the visible group name in `/models`; its storage ID is generated automatically.
2. **API base URL** — accepts an API root such as `https://api.example.com/v1`, and also normalizes URLs ending in `/chat/completions`.
3. **API key** — shown masked and saved separately from provider metadata. Leave it blank for a local endpoint without authentication.
4. **Models** — enter IDs separated by commas, or leave the field blank and press Enter to discover them automatically.

The API key is typed in a dedicated masked input. It never passes through the chat prompt, input history, transcript, or terminal title.

## Automatic model discovery

When the model field is empty, Codebuff sends:

```text
GET <normalized-base-url>/models
```

When an API key was entered, the request includes:

```text
Authorization: Bearer <api-key>
```

The discovery parser supports the standard OpenAI response shape:

```json
{
  "data": [{ "id": "model-a" }, { "id": "model-b", "name": "Model B" }]
}
```

It also accepts a top-level array and arrays stored under `models` or `results`. Duplicate IDs are removed. Discovery has a 15-second timeout; if it fails, the assistant remains open so the user can correct the URL/key or enter model IDs manually.

## Select a model with `/models`

Enter:

```text
/models
```

A keyboard and mouse selector opens inside the editor:

- Providers are sorted by display name.
- Models are grouped beneath their provider.
- Models within each provider are sorted by display name or ID.
- The active model is marked with `●`.
- Arrow keys move the selection, Enter activates it, and Esc closes the selector.
- The first `Codebuff` group contains `Backend predeterminado`, which disables the custom-provider override interactively.

The new selection resets the cached SDK client and applies to the next request. A request already running continues with the provider/model it started with.

## Tool history, schemas, and JSON safety

Tool inputs and JSON results are normalized before they are stored or replayed to an OpenAI-compatible provider. If an integration returns an in-memory circular reference, only that circular branch is represented as the string `[Circular]`; the rest of the tool data and conversation remains available to the next request. `bigint` values are preserved as decimal strings.

Runtime tool schemas are also converted from live Zod/lazy instances into plain JSON Schema before they enter `AgentState`. The SDK normalizes every final `prompt-response` session before returning it, so the next call can safely use that result as `previousRun` even after tools were available or executed.

This normalization is applied at the tool boundary, tool-schema snapshot, Codebuff-message conversion, provider request body, and final SDK response. It covers built-in tools, custom tools, MCP tool results, the main agent, and subagents.

## Storage and security

All persistent configuration is stored in Codewolf's single cross-platform home directory, `~/.codewolf/`. Development and compiled binaries use the same location:

- Windows: `C:\\Users\\<user>\\.codewolf\\`
- Linux: `/home/<user>/.codewolf/`
- macOS: `/Users/<user>/.codewolf/`


- `~/.codewolf/providers.json` stores provider names, URLs, model lists, and the active selection.
- `~/.codewolf/provider-auth.json` stores directly entered API keys separately and is written with user-only permissions where POSIX modes are supported.
- `~/.codewolf/skills/` stores global skills.
- `~/.codewolf/projects/` stores project chat history and run state.

Neither file belongs in the current project repository. The API key is never stored in `providers.json`.

## Advanced provider fields

The interactive assistant creates standard OpenAI-compatible providers. Existing advanced metadata remains supported by `providers.json`, including custom headers, a different API-key header/prefix, structured-output capability, and per-model output-token limits.

```json
{
  "version": 1,
  "activeProviderId": "custom",
  "activeModelId": "model-a",
  "providers": [
    {
      "id": "custom",
      "name": "Custom service",
      "baseUrl": "https://api.example.com/v1",
      "apiKeyHeader": "Authorization",
      "apiKeyPrefix": "Bearer",
      "supportsStructuredOutputs": true,
      "headers": {
        "X-Organization": "example"
      },
      "models": [
        {
          "id": "model-a",
          "name": "Model A",
          "maxOutputTokens": 32768
        }
      ]
    }
  ]
}
```

## SDK usage

The direct-provider routing layer remains available through `CodebuffClientOptions` for programmatic SDK users:

```typescript
import { CodebuffClient } from '@codebuff/sdk'

const client = new CodebuffClient({
  apiKey: 'local-custom-provider',
  cwd: process.cwd(),
  customProvider: {
    id: 'local',
    name: 'Local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelId: 'qwen2.5-coder:14b',
  },
})
```

When `customProvider` is present, the SDK skips Codebuff user validation, remote agent lookups, billing callbacks, and run persistence. Bundled and local agent definitions remain available, and all model calls go directly to the configured endpoint.
