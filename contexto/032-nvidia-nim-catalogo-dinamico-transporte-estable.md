# 032 — NVIDIA NIM con catálogo dinámico y transporte estable

# Fecha

2026-07-15

# Objetivo

Integrar NVIDIA NIM como proveedor dedicado de Codewolf, autenticable mediante
API key desde `/login`, con modelos actuales para programación y agentes y sin
reproducir los fallos de streaming observados en la implementación de referencia.

# Archivos importantes modificados

- `cli/src/providers/nvidia-nim-catalog.ts`
- `cli/src/utils/nvidia-nim-provider.ts`
- `cli/src/utils/provider-catalogs.ts`
- `cli/src/components/provider-auth-flow-screen.tsx`
- `cli/src/components/model-selector-screen.tsx`
- `cli/src/chat.tsx`
- `cli/src/utils/custom-providers.ts`
- `common/src/types/custom-provider.ts`
- `sdk/src/impl/model-provider.ts`
- `packages/llm-providers/src/openai-compatible/chat/openai-compatible-chat-language-model.ts`
- `cli/src/utils/__tests__/nvidia-nim-provider.test.ts`
- `packages/llm-providers/src/openai-compatible/chat/__tests__/non-streaming-transport.test.ts`
- `README.md`
- `docs/custom-providers.md`
- `AGENTS.md`

# Soluciones implementadas

- `/login` ofrece NVIDIA NIM dentro del método **Usar una API key**.
- La clave se escribe en un campo enmascarado, se guarda únicamente en
  `~/.codewolf/provider-auth.json` y se envía como `Authorization: Bearer` solo
  en las solicitudes reales de chat, no al catálogo público.
- El login guarda la clave y consulta
  `https://integrate.api.nvidia.com/v1/models` sin enviar la clave, para
  persistir los modelos de chat reconocibles publicados en el catálogo global.
- El catálogo NVIDIA se actualiza al iniciar Codewolf y cada vez que se abre
  `/models`. Una respuesta exitosa reemplaza la lista anterior, por lo que los
  modelos nuevos aparecen y los retirados desaparecen.
- Se excluyen endpoints evidentemente ajenos al chat, como embeddings, rerank,
  OCR, TTS, generación/edición de imágenes, seguridad y Cosmos.
- Los modelos desconocidos usan una ventana conservadora de 32 768 tokens, o
  la ventana indicada en su ID (`8k`, `32k`, etc.), hasta que NVIDIA publique
  metadatos más precisos.
- Los modelos actuales conocidos reciben nombres y ventanas de contexto
  verificadas, incluyendo DeepSeek V4 Pro/Flash, GLM-5.2, Nemotron 4/3,
  MiniMax M3, Mistral Medium 3.5, Mistral Small 4, Step 3.7 Flash, Gemma 4 y
  otros modelos de código. Los IDs adicionales solo aparecen si `/models` los
  devuelve.
- NVIDIA conserva `useNonStreaming: true`. El adaptador OpenAI-compatible hace
  una petición JSON completa y la convierte en eventos internos de texto,
  razonamiento, tool calls, finish reason y uso.
- Esta ruta evita depender de un chunk SSE final con `finish_reason`, problema
  que en la implementación de referencia podía fallar después de ejecutar una
  herramienta.
- Los demás proveedores conservan streaming normal; la compatibilidad no cambia
  su comportamiento.

# Decisiones tomadas

- El resultado exitoso de `/v1/models` es autoritativo. La lista estática solo
  aporta metadatos y prioridades; nunca debe reintroducir un modelo retirado por
  NVIDIA.
- No se incluyeron como opciones principales modelos que la documentación
  oficial ya marca como obsoletos, como GLM-5.1.
- DeepSeek V4 Pro queda primero entre los modelos conocidos, por lo que se activa
  inicialmente cuando aparece en el catálogo devuelto por NVIDIA.

# Arquitectura actual

- `nvidia-nim-catalog.ts` contiene constantes, aliases, metadatos y filtrado.
- `nvidia-nim-provider.ts` realiza descubrimiento, configuración y refresco.
- `provider-catalogs.ts` coordina en paralelo los catálogos dinámicos de
  OpenCode y NVIDIA sin volver fatal una caída de red.
- `CustomProviderRuntimeConfig.useNonStreaming` viaja desde el CLI hasta el
  adaptador de lenguaje del SDK.

# Librerías usadas

No se agregaron dependencias. Se reutilizan `fetch`, Zod, el adaptador
OpenAI-compatible existente y los contratos de AI SDK ya instalados.

# Problemas encontrados

- La implementación de `coding-agent` conservaba IDs que ya no reflejan el
  catálogo oficial más reciente; por ejemplo, GLM-5.1 fue sustituido por
  GLM-5.2 y aparece como obsoleto en NVIDIA.
- El endpoint público `/v1/models` devuelve un catálogo global incluso sin API
  key. Por ello no se usa como prueba de autenticación ni se promete que cada
  modelo esté habilitado para una cuenta concreta.
- El entorno de revisión no incluye Bun ni las dependencias instaladas, por lo
  que no fue posible ejecutar aquí la suite real. Debe validarse en el entorno
  del proyecto con los comandos indicados abajo.

# Validación ejecutada

- Transpilación sintáctica correcta de los 12 archivos TypeScript/TSX tocados.
- Prueba ejecutable del filtrado, aliases, prioridad y metadatos del catálogo.
- Prueba ejecutable del adaptador no-streaming con razonamiento, texto, tool
  call, metadatos de respuesta, finish reason y uso.
- Verificación oficial de que `/v1/models` publica DeepSeek V4 Pro/Flash,
  GLM-5.2, Nemotron 4/3, MiniMax M3, Mistral Medium 3.5, Step 3.7 Flash y
  otros modelos vigentes.

# Validación pendiente en el entorno del usuario

El entorno de revisión no contiene Bun ni `node_modules`, por lo que todavía se
deben ejecutar las pruebas reales y la compilación:

```bash
bun install --frozen-lockfile
bun run --cwd ./cli typecheck
bun test cli/src/utils/__tests__/nvidia-nim-provider.test.ts
bun test packages/llm-providers/src/openai-compatible/chat/__tests__/non-streaming-transport.test.ts
bun test
bun run build:binary
```

# Próximos pasos

Probar `/login` con una API key NVIDIA real, seleccionar DeepSeek V4 Pro y
Flash desde `/models`, ejecutar herramientas durante al menos dos turnos y
confirmar que `/models` refleja el catálogo global publicado y comprobar qué
modelos acepta realmente la API key mediante solicitudes de chat.
