# Interactive custom providers and model switching

The Codewolf editor can route all agent requests directly to an OpenAI-compatible API. The selected provider and model apply globally to the main agent and every subagent created during the run.

This feature is configured entirely inside the editor.

## ChatGPT/Codex subscription

`/login` separates subscription authentication from API-key providers. Under **Usar una suscripción**, choose **ChatGPT Plus/Pro (Codex Subscription)** and then either:

- **Código de dispositivo:** Codewolf requests a one-time code, displays the verification URL, polls until the browser authorization completes, and exchanges the resulting authorization code for access and refresh tokens. This is the preferred path for SSH, containers, WSL without browser interop, and other headless environments.
- **Navegador con callback local:** Codewolf starts the PKCE browser flow and listens on `127.0.0.1:1455` for the callback.

OAuth credentials are stored in `~/.codewolf/credentials.json` with user-only POSIX permissions where supported. They never enter `providers.json`, `provider-auth.json`, prompts, transcripts, or terminal titles. Access tokens are refreshed automatically. The bundled `openai-codex` provider is visible in `/models` only after credentials exist and is not editable or deletable from `/providers`.

The provider routes directly to the ChatGPT Codex Responses endpoint and never falls back to the normal Codewolf backend when credentials are missing, expired, unauthorized, or rate-limited. The selectable catalog contains the current documented Codex models, but the signed-in account and workspace remain authoritative for actual model access and usage limits.

## No `.env` file is required

The standalone CLI supplies its own safe defaults for inherited public web variables. You can install dependencies and run `bun run dev` without creating `.env` in either the repository root or `cli/`. Explicit environment variables still override the built-in defaults. Analytics is disabled in the fallback configuration.

## Open the editor without an existing login

The full editor opens on a fresh installation without legacy backend credentials. OpenCode Free supplies a no-key default, while `/login` remains available for a ChatGPT/Codex subscription, NVIDIA NIM, OpenCode Go, or another OpenAI-compatible provider.

## OpenCode Free built-in catalog

Codewolf temporarily bundles a read-only provider named **OpenCode Free**. On a fresh installation it is the active provider and its first free model is selected automatically.

- Base URL: `https://opencode.ai/zen/v1`
- Model catalog: `https://opencode.ai/zen/v1/models`
- Authentication: none
- Filter: only model IDs ending exactly in `-free`

The catalog refreshes in the background when the editor starts and whenever `/models` opens. If the endpoint is unavailable, Codewolf keeps the most recent cache from `~/.codewolf/opencode-models.json`; if no cache exists, it falls back to a small embedded list. OpenCode Free is never written as a provider definition and never receives an entry in `provider-auth.json`.

The built-in provider appears in `/models`, but not in `/providers`, because it cannot be edited or deleted from the provider manager. This integration is isolated in `cli/src/providers/opencode-catalog.ts` and `cli/src/utils/opencode-providers.ts` so it can be removed later without changing the generic OpenAI-compatible provider system.

## Configure authentication with `/login`

Enter:

```text
/login
```

The first selector shows:

1. **Usar una suscripción** — opens the ChatGPT/Codex subscription flow described above.
2. **Usar una API key** — opens the API-provider selector.

The API-key selector supports:

### NVIDIA NIM

NVIDIA NIM is available as a dedicated provider:

- Base URL: `https://integrate.api.nvidia.com/v1`
- Model catalog: `https://integrate.api.nvidia.com/v1/models`
- Authentication: `Authorization: Bearer <api-key>`

The masked key is saved only in `~/.codewolf/provider-auth.json`. During login, Codewolf stores the key and reads every chat-capable model returned by `/models`; recognized models are enriched with context metadata and ordered ahead of less familiar entries. The current metadata prioritizes DeepSeek V4 Pro and Flash, GLM-5.2, Nemotron 3 Ultra/Super/Nano, MiniMax M3, Mistral Medium 3.5, Step 3.7 Flash, and other coding models. Additional known IDs are used only when NVIDIA actually returns them in the public global catalog.

The NVIDIA catalog refreshes when Codewolf starts and when `/models` opens. A successful refresh replaces the previous list, so newly published models appear and withdrawn models disappear. The endpoint exposes a public global catalog, so login does not prove that the key is valid or that every listed model is enabled for that account; NVIDIA confirms both on the first completion request. The last persisted list remains available if a later refresh fails.

NVIDIA requests use a complete JSON Chat Completions response internally instead of SSE token streaming. Codewolf converts that response back into the normal agent event contract, including text, reasoning, tool calls, finish reason, and usage. This avoids NVIDIA-compatible streams that close without a final `finish_reason`, which could otherwise fail a turn after a tool call.

### OpenCode Go

OpenCode Go is a separately authenticated provider:

- Base URL: `https://opencode.ai/zen/go/v1`
- Model catalog: `https://opencode.ai/zen/go/v1/models`
- Authentication: `Authorization: Bearer <api-key>`

The API key is typed in a masked input and saved only in `~/.codewolf/provider-auth.json`. Codewolf discovers the current Go models before storing and activating the provider. Reopening `/models` refreshes the list using the stored key.

### Generic OpenAI-compatible provider

The existing assistant remains available and asks for:

1. **Provider name** — used as the visible group name in `/models`; its storage ID is generated automatically.
2. **API base URL** — accepts an API root such as `https://api.example.com/v1`, and also normalizes URLs ending in `/chat/completions`.
3. **API key** — shown masked and saved separately from provider metadata. Leave it blank for a local endpoint without authentication.
4. **Models** — enter IDs separated by commas. Append `=context-tokens` when the provider does not publish its context window, for example `deepseek-v4-pro=1000000`. Leave the field blank and press Enter to discover models automatically.

The API key never passes through the chat prompt, input history, transcript, or terminal title.

## Automatic model discovery

When the model field is empty, Codewolf sends:

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

It also accepts a top-level array and arrays stored under `models` or `results`. Duplicate IDs are removed. When available, Codewolf reads the context window from `context_length`, `context_window`, `max_context_length`, `max_model_len`, or `max_position_embeddings`. Discovery has a 15-second timeout; if it fails, the assistant remains open so the user can correct the URL/key or enter model IDs manually.

## Model context and automatic compaction

Codewolf runs the bundled `context-pruner` before each Base2 step. The pruner replaces old history with a bounded summary when the current context reaches 90% of the selected model's maximum window. Manual model configuration uses this syntax:

```text
deepseek-v4-pro=1000000, local-coder=131072
```

The first value means auto-compaction starts near 900,000 tokens; the second starts near 117,964 tokens. Explicit or discovered values take precedence. For backward-compatible provider files without context metadata, models whose ID contains `deepseek` default to 1,000,000 tokens and other custom models default to 400,000.

The manual `/compact` command is always available and does not wait for the threshold.

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
- The normal selector contains only direct providers/models. Codewolf does not expose a hidden backend fallback as a selectable model.

The new selection resets the cached SDK client and applies to the next request. A request already running continues with the provider/model it started with.

## Invoke the generic agent with `/agent`

Enter:

```text
/agent
```

The command inserts `@Agent ` into the prompt. The generic agent does not maintain a separate provider/model assignment and does not open another model selector. It inherits the provider and model currently active through `/models`, because the active custom-provider configuration is propagated globally to the main agent and every spawned subagent.

If no direct provider is active, Codewolf stops before model execution and asks the user to configure/select one through `/login` and `/models`. It never falls back silently to the historical Codebuff backend. Switching `/models` resets the cached SDK client, so the next `/agent` request uses the new selection.

## Tool history, schemas, and JSON safety

Tool inputs and JSON results are normalized before they are stored or replayed to an OpenAI-compatible provider. If an integration returns an in-memory circular reference, only that circular branch is represented as the string `[Circular]`; the rest of the tool data and conversation remains available to the next request. `bigint` values are preserved as decimal strings.

Runtime tool schemas are also converted from live Zod/lazy instances into plain JSON Schema before they enter `AgentState`. The SDK normalizes every final `prompt-response` session before returning it, so the next call can safely use that result as `previousRun` even after tools were available or executed.

This normalization is applied at the tool boundary, tool-schema snapshot, Codebuff-message conversion, provider request body, and final SDK response. It covers built-in tools, custom tools, MCP tool results, the main agent, and subagents.

Provider metadata is never allowed to overwrite protocol-critical fields such as `role`, `content`, `tool_calls`, or `tool_call_id`. When an older `run-state.json` already contains nullable or malformed messages, Codewolf repairs compatible entries and removes irrecoverable/orphaned entries before replaying the session.

Direct custom providers also enable strict assistant-content compatibility. Tool-call-only and reasoning-only assistant turns are normally represented with an empty `content` string by the OpenAI-compatible protocol, but some gateways (including CommandCode-style proxies) coerce that falsy value to `null` and then reject it during their own schema validation. Codewolf sends a single whitespace character for those otherwise-empty assistant messages only on direct custom-provider requests, preserving tool calls and reasoning while preventing a malformed replay after an interrupted response.

## Storage and security

All persistent configuration is stored in Codewolf's single cross-platform home directory, `~/.codewolf/`. Development and compiled binaries use the same location:

- Windows: `C:\\Users\\<user>\\.codewolf\\`
- Linux: `/home/<user>/.codewolf/`
- macOS: `/Users/<user>/.codewolf/`

- `~/.codewolf/providers.json` stores provider names, URLs, model lists, and the active selection.
- `~/.codewolf/provider-auth.json` stores directly entered API keys separately and is written with user-only permissions where POSIX modes are supported.
- `~/.codewolf/credentials.json` stores the ChatGPT/Codex OAuth access and refresh tokens separately from provider definitions and is also restricted to the current user where POSIX modes are supported.
- `~/.codewolf/opencode-models.json` caches only the public OpenCode Free model catalog; it contains no credentials.
- `~/.codewolf/skills/` stores global skills.
- `~/.codewolf/projects/` stores project chat history and run state.

Neither file belongs in the current project repository. The API key is never stored in `providers.json`.

## Advanced provider fields

The interactive assistant creates standard OpenAI-compatible providers. Existing advanced metadata remains supported by `providers.json`, including custom headers, a different API-key header/prefix, structured-output capability, a non-streaming compatibility transport, and per-model output/context-token limits.

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
      "useNonStreaming": false,
      "headers": {
        "X-Organization": "example"
      },
      "models": [
        {
          "id": "model-a",
          "name": "Model A",
          "maxOutputTokens": 32768,
          "maxContextTokens": 1000000
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
    maxContextTokens: 131072,
  },
})
```

When `customProvider` is present, the SDK skips Codebuff user validation, remote agent lookups, billing callbacks, and run persistence. Bundled and local agent definitions remain available, and all model calls go directly to the configured endpoint.

## Internet connectivity and recovery

The interactive CLI does not use Codebuff health endpoints to decide whether it is online. Connectivity is probed against multiple public endpoints that are independent of both Codebuff and the selected model provider.

- A user prompt that needs AI remains queued while public Internet is unavailable and is submitted automatically after connectivity returns.
- If a provider request or active agent step fails at the transport layer, Codewolf probes public Internet separately. A confirmed outage pauses and retries the same request/step after recovery.
- Provider HTTP responses such as `401`, `403`, `429`, and `5xx` remain provider/API errors. They never trigger indefinite offline waiting.
- If public Internet is available but only the provider endpoint cannot be reached, Codewolf reports a provider connection error and uses bounded provider retry behavior.
- Agent validation and context-token accounting are local. Active documentation lookup talks directly to Context7; normal provider-direct execution does not need Codebuff validation, token-count, run-tracking, or healthcheck services.

Offline queues and active run state are process-local. Closing the CLI terminates the current execution; reconnect recovery is intended for network loss while the same Codewolf process remains running.

## Subagent routing guarantee

The selected provider is propagated to every spawned agent, including `researcher-web`, inline agents, reviewers, file explorers, and other bundled subagents. Their hard-coded template model remains metadata only while a custom provider is active; the actual request uses the model selected in `/models`.

The CLI also uses an internal `local-custom-provider:<id>` sentinel instead of any stored Codebuff token while direct-provider mode is active. If provider context is ever lost, the SDK stops with an explicit internal routing error rather than silently contacting the original backend and returning a misleading HTTP 401.

## Replayed tool-call protection

Some OpenAI-compatible gateways repeat a completed tool call under another stream index or generated ID. Codewolf makes provider tool-call emission idempotent by provider ID and then performs semantic deduplication after direct-agent calls are normalized to `spawn_agents`. A repeated `researcher-web` request therefore results in one execution and one TUI card, while requests with different prompts or params continue to run separately.

## Administrar proveedores con `/providers`

`/providers` abre un administrador completamente interactivo. La lista muestra el
proveedor activo, la cantidad de modelos, el tipo de autenticación y su URL base.
Desde cada proveedor se puede:

- editar el nombre visible;
- cambiar la URL base;
- conservar, reemplazar o eliminar la API key;
- actualizar modelos manualmente, incluyendo `modelo=tokens` para su contexto máximo;
- borrar el campo de modelos y pulsar Enter para consultar `/models`;
- activarlo como proveedor actual;
- abrir el selector global `/models`;
- eliminar su configuración y credencial guardada.

El identificador interno del proveedor se conserva al editarlo, por lo que
renombrar el texto visible no rompe la selección activa ni referencias guardadas.
Una API key vacía durante la edición conserva la credencial existente; escribir
`none` la elimina. Las claves permanecen en `~/.codewolf/provider-auth.json` y
nunca se muestran en la lista ni pasan al historial del chat.

## Removing the temporary OpenCode integration

The generic provider system does not depend on OpenCode-specific code. To remove the temporary integration later:

1. Delete `cli/src/providers/opencode-catalog.ts` and `cli/src/utils/opencode-providers.ts`.
2. Remove the bundled-provider merge from `loadAvailableProvidersConfig()` and return the persisted configuration directly.
3. Remove the background refresh from `chat.tsx` and `model-selector-screen.tsx`.
4. Replace `ProviderAuthFlowScreen` with the generic `ProviderLoginScreen`, or keep the method screen and remove only the OpenCode Go row.
5. Remove the read-only filter/note from `provider-manager-screen.tsx` and the focused OpenCode tests.

Existing generic providers, `providers.json`, `provider-auth.json`, `/providers`, `/models`, and direct SDK routing remain valid after those removals. The optional public catalog cache `~/.codewolf/opencode-models.json` can then be deleted safely.
