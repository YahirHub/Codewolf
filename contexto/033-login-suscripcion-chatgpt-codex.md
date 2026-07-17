# 033 — Login de suscripción ChatGPT/Codex

# Fecha

2026-07-15

# Objetivo

Integrar en `/login` la autenticación de una cuenta ChatGPT/Codex mediante
suscripción, con acceso por código de dispositivo para terminales remotas y por
callback local del navegador, y permitir seleccionar modelos Codex desde
`/models` sin configurar una API key.

# Archivos importantes modificados

- `common/src/constants/chatgpt-oauth.ts`
- `cli/src/providers/openai-codex-catalog.ts`
- `cli/src/components/chatgpt-codex-login-screen.tsx`
- `cli/src/components/provider-auth-flow-screen.tsx`
- `cli/src/utils/chatgpt-oauth.ts`
- `cli/src/utils/custom-providers.ts`
- `sdk/src/credentials.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/impl/llm.ts`
- `cli/src/utils/__tests__/chatgpt-oauth.test.ts`
- `cli/src/utils/__tests__/openai-codex-provider.test.ts`
- `sdk/src/impl/__tests__/model-provider-free-mode.test.ts`
- `README.md`
- `docs/custom-providers.md`
- `AGENTS.md`

# Soluciones implementadas

- La opción **Usar una suscripción** de `/login` quedó habilitada y contiene
  **ChatGPT Plus/Pro (Codex Subscription)**.
- El método recomendado solicita un código de dispositivo, muestra la URL de
  verificación y el código de un solo uso, abre el navegador cuando es posible
  y consulta automáticamente hasta que el usuario completa la autorización.
- El método alternativo conserva OAuth PKCE con callback local en
  `127.0.0.1:1455`, útil cuando el navegador corre en el mismo equipo.
- Los códigos de autorización se intercambian mediante formularios OAuth y los
  access/refresh tokens se guardan únicamente en
  `~/.codewolf/credentials.json`.
- El archivo de credenciales conserva otros datos existentes y se escribe con
  permisos `0600`; el directorio usa `0700` en sistemas POSIX.
- Después de autenticar, Codewolf activa el proveedor integrado `openai-codex`,
  reinicia el cliente y lo agrega a `/models` sin persistir una definición
  editable en `providers.json`.
- El catálogo integrado incluye GPT-5.6 Sol, Terra y Luna, GPT-5.5, GPT-5.4,
  GPT-5.4 mini y GPT-5.3 Codex Spark. La cuenta y el workspace siguen siendo la
  autoridad sobre disponibilidad y límites efectivos.
- Las solicitudes del proveedor de suscripción se envían al endpoint Codex con
  OAuth y no pasan por el adaptador genérico de API keys.
- Si faltan credenciales, la renovación falla o existe un límite temporal, la
  ruta termina con un error accionable y no cae silenciosamente al backend
  normal.
- Los modelos antiguos permanecen reconocibles para reanudar sesiones
  heredadas, pero no se ofrecen como opciones principales nuevas.

# Decisiones tomadas

- Código de dispositivo queda primero porque no depende de un callback localhost
  accesible desde el navegador y funciona mejor en SSH, contenedores y equipos
  sin interfaz gráfica.
- El proveedor de suscripción es integrado y de solo lectura, igual que otros
  catálogos especiales; `/providers` continúa administrando únicamente
  proveedores persistidos por el usuario.
- La existencia de tokens no se interpreta como prueba de acceso a todos los
  modelos. La validación real ocurre cuando Codex procesa una solicitud.

# Arquitectura actual

- `chatgpt-oauth.ts` controla PKCE, código de dispositivo, polling, intercambio,
  cancelación y mensajes sanitizados.
- `openai-codex-catalog.ts` contiene el catálogo visible y metadatos de contexto.
- `custom-providers.ts` agrega condicionalmente el proveedor cuando existen
  credenciales y protege su ID reservado.
- `model-provider.ts` intercepta `openai-codex` antes del proveedor genérico,
  renueva credenciales cuando corresponde y crea el modelo directo Codex.

# Librerías usadas

No se agregaron dependencias. Se reutilizan `fetch`, `crypto`, `http`, React,
OpenTUI y la persistencia OAuth que ya existía en el SDK.

# Problemas encontrados

- El proyecto contenía un OAuth experimental separado en `/connect:chatgpt`,
  pero `/login` mantenía las suscripciones deshabilitadas y `/models` no podía
  activar esa ruta.
- El intercambio y la renovación antiguos enviaban JSON; se alinearon al cuerpo
  `application/x-www-form-urlencoded` usado por el flujo Codex de referencia.
- La instalación completa de dependencias intentó compilar `canvas` y no pudo
  descargar headers de Node por DNS. Las dependencias TypeScript ya instaladas
  fueron suficientes para ejecutar typecheck y las pruebas enfocadas.

# Validación ejecutada

- `bun run --cwd ./cli typecheck`: correcto.
- `bun run --cwd ./sdk typecheck`: correcto.
- 41 pruebas enfocadas correctas, incluyendo dispositivo, persistencia,
  catálogo, activación, enrutamiento OAuth, ausencia de fallback, OpenCode y
  NVIDIA NIM.
- `bun run build:binary`: correcto; se generó el binario Linux x64.
- La suite completa también se ejecutó como regresión amplia, pero dos pruebas
  no modificadas de `packages/agent-runtime` fallaron por estado compartido y
  timeout. Las pruebas enfocadas y los typechecks relacionados con este cambio
  permanecieron correctos.

# Pendientes

- Probar con una cuenta ChatGPT real que tenga habilitado el código de
  dispositivo y confirmar qué modelos expone su plan o workspace.

# Próximos pasos

Abrir `/login`, elegir **Usar una suscripción**, completar primero el código de
dispositivo, seleccionar GPT-5.6 Sol desde `/models` y probar un turno simple y
otro con herramientas. Repetir el acceso mediante callback local como regresión.
