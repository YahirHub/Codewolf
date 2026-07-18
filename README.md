# Codewolf

Codewolf es un editor y agente de programación para terminal con proveedores de modelos y motores de búsqueda configurables. El modo de desarrollo y los binarios compilados comparten toda la información persistente desde `~/.codewolf`.

## Instalación rápida

Linux, macOS y terminales Git Bash/MSYS en Windows pueden instalar la última
release publicada con:

```bash
curl -fsSL https://raw.githubusercontent.com/YahirHub/codewolf/main/install.sh | sh
```

El instalador detecta sistema operativo, arquitectura, libc musl y compatibilidad
AVX2 para elegir la variante correcta. Instala `codewolf` y
`tree-sitter.wasm` en `~/.local/bin`, agrega esa ruta a `~/.bashrc` y verifica
`SHA256SUMS.txt` antes de reemplazar archivos.

Si ya existe Codewolf, descarga nuevamente la release `latest` y crea primero
un respaldo comprimido de `~/.codewolf` en `~/.codewolf-backups`. Se puede
cambiar el repositorio o las rutas mediante `CODEWOLF_REPOSITORY`,
`CODEWOLF_BIN_DIR`, `CODEWOLF_CONFIG_DIR` y `CODEWOLF_BACKUP_DIR`.

Consulta [docs/install.md](docs/install.md) para conocer detección, actualización
y variables avanzadas.

## Funciones principales

- Onboarding de primera ejecución con atribución, suscripción, proveedor personalizado u OpenCode Free.
- OpenCode Free integrado sin API key, con catálogo dinámico de modelos `-free`.
- ChatGPT Plus/Pro (Codex Subscription) mediante navegador o código de dispositivo desde `/login`.
- NVIDIA NIM, OpenCode Go y proveedores OpenAI-compatible configurables desde `/login`.
- Selector de modelos agrupados por proveedor mediante `/models`.
- Agente auxiliar genérico mediante `/agent`, usando el modelo activo de la sesión.
- Búsqueda web multiproveedor con Tavily, Brave Search, Exa, Linkup, Firecrawl, SerpApi y Zenserp.
- Fallback automático entre motores de búsqueda configurados.
- Estadísticas locales de tokens por sesión, proyecto, agente y modelo mediante `/usage`.
- Skills globales en `~/.codewolf/skills` y skills locales en `.codewolf/skills`.
- Conversaciones con nombre visible, historial, exportación e importación portable.
- Compactación manual con `/compact` y compactación automática al 90 % del contexto del modelo.
- Modo PLAN de solo lectura con planes verificables, revisión y aprobación por nivel de ejecución.
- Checkpoints `/rewind` para volver la conversación, los archivos editados por Codewolf o ambos.
- Perfiles SSH globales, bóveda portable cifrada y conexiones simultáneas para navegar, transferir archivos, ejecutar comandos y conservar shells remotas.
- Herramienta interna `gitzip` para crear ZIP/TAR/TAR.GZ respetando `.gitignore`, subirlos por SSH o comprimir directamente en servidores conectados.
- Seguridad configurable desde `/config` para operaciones locales, SSH y lectura de secretos `.env`.
- Metodología opcional desde `/config`, con resumen automático de `contexto/` y commits verificados después de probar.
- Conversaciones y configuración compartidas entre desarrollo y binarios.
- Binarios para Linux, macOS y Windows en x64/ARM64, con variantes baseline y musl.
- Instalador/actualizador `install.sh` con verificación SHA-256 y respaldo de `~/.codewolf`.

## Requisitos de desarrollo

- Bun `1.3.14`.
- Git.

La versión requerida de Bun también está declarada en `.bun-version` y `package.json`.

## Instalar dependencias para desarrollo

Desde la raíz:

```bash
bun install --frozen-lockfile
```

## Ejecutar en desarrollo

```bash
bun run dev
```

No se requiere un archivo `.env` para utilizar proveedores personalizados.

## Configurar metodología de trabajo

Ejecuta:

```text
/config
```

La pantalla permite activar por separado:

- **Contexto persistente del proyecto:** al abrir un proyecto busca `contexto/*.md`, los ordena por número y utiliza un agente de solo lectura para resumir arquitectura, reglas, decisiones y pendientes. El resumen se cachea por huella de archivos y se inyecta junto con la metodología en cada ejecución. Después de una implementación con cambios reales, Codewolf crea localmente un registro técnico corto y actualiza `000-contexto-maestro.md` sin gastar otra llamada al modelo; filtra texto conversacional, evita nombres copiados de la solicitud y omite secciones sin datos. Con la opción activa, `/init` crea `contexto/` si falta y lo actualiza analizando el proyecto.
- **Commits automáticos verificados:** después de una implementación con archivos editados, Codewolf pausa la cola y pide probar el resultado. Si eliges **No crear commit**, esos cambios verificados quedan pendientes y se acumulan con las siguientes implementaciones. Cuando finalmente confirmas, el commit incluye todos los cambios pendientes seguros desde el último commit automático, sin mezclar modificaciones manuales o ajenas.

El mensaje del commit se deriva primero de los cambios reales: estado Git, archivos, títulos Markdown y solicitud original. Por ejemplo, si el turno crea documentos en `contexto/`, el Summary describe la creación del contexto en lugar de usar frases genéricas como “Guardar cambios verificados”. El proveedor activo puede refinar el mensaje, pero una caída temporal no impide crear un commit correcto porque existe un fallback semántico local.

Los comandos de terminal usan sintaxis Bash desde la raíz activa del proyecto en Windows, Linux y macOS. Codewolf elimina un `cd` redundante y convierte rutas de Windows a la forma de Git Bash o WSL cuando corresponde.

Las dos opciones están desactivadas por defecto y se guardan en `~/.codewolf/settings.json`. Los commits verificados nunca incluyen cambios previamente preparados, archivos manuales que ya estaban modificados antes del primer turno elegible ni ediciones posteriores realizadas fuera de Codewolf. Los cambios que Codewolf dejó pendientes al seleccionar **No crear commit** sí se reconocen en turnos posteriores mediante huellas persistentes. Tampoco ejecutan `git push`.

Cuando la metodología está activa, el agente debe utilizar las herramientas de búsqueda y los agentes de documentación si duda de una API, versión, arquitectura, seguridad, despliegue o estructura de proyecto. Debe priorizar fuentes oficiales y avisar cuando no tenga búsqueda disponible.

Consulta [docs/project-methodology.md](docs/project-methodology.md) para conocer el flujo y las protecciones completas.

## Configurar seguridad y conexiones SSH

Abre `/config` y entra en **SEGURIDAD**. Los controles son independientes:

- **Modo seguro local:** pide permiso para comandos, mutaciones de archivos, hooks, MCP y herramientas externas. Está desactivado por defecto.
- **Modo seguro SSH:** pide permiso para conectar, ejecutar, transferir o modificar en servidores; la navegación y lectura normal quedan libres. Está activado por defecto.
- **Proteger archivos .env:** pide permiso antes de mostrar contenido de `.env` o `.env.*` local o remoto, incluso en modo normal. Está activado por defecto.

La herramienta interna `ssh_remote` administra perfiles globales en `~/.codewolf/ssh-servers.json`, credenciales cifradas en `~/.codewolf/ssh-secrets.enc` y varias conexiones activas reutilizables mediante `ssh://<connection_id>`. La contraseña maestra y las credenciales solicitadas se introducen en una pantalla enmascarada del CLI y nunca se entregan al agente. La bóveda permanece desbloqueada solo durante el proceso actual. Una acción SSH que además exponga un `.env` pide por separado permiso remoto y permiso de lectura del secreto.

`gitzip` reutiliza esas conexiones para empaquetar y desplegar proyectos. Aplica `.gitignore` raíz y anidados, excluye `.git/` y `.env` protegidos, puede generar ZIP/TAR/TAR.GZ localmente, subir por SFTP, extraer en destino o crear el archivo directamente en el servidor mediante un manifiesto filtrado. Consulta `docs/gitzip.md`.

Consulta [docs/safe-mode.md](docs/safe-mode.md) y [docs/ssh-remote.md](docs/ssh-remote.md) para conocer las operaciones protegidas, autenticación y límites.

## Configurar modelos

En una instalación nueva, Codewolf muestra primero un onboarding visual y adaptable con el logotipo animado de Codewolf. La pantalla explica el origen del proyecto y permite iniciar sesión con una suscripción, agregar un proveedor personalizado o comenzar con **OpenCode Free**. Si se elige omitir la configuración, OpenCode Free queda activo. No requiere API key. Al iniciar y al abrir `/models`, consulta `https://opencode.ai/zen/v1/models`, conserva únicamente los IDs terminados en `-free` y usa una lista integrada como respaldo si la consulta no está disponible. El catálogo dinámico se guarda en `~/.codewolf/opencode-models.json`; nunca se escribe una credencial para este proveedor.

Para volver a abrir la configuración inicial sin borrar credenciales ni
historial:

```bash
codewolf --onboarding
```

La decisión de mostrar el onboarding se captura antes de que el inicio cree
directorios, analítica local o `recent-projects.json`; esos archivos generados
durante el mismo arranque no hacen que una instalación nueva se confunda con
una actualización.

Para autenticar otro proveedor:

```text
/login
```

La primera pantalla permite elegir **Usar una suscripción** o **Usar una API key**.

En **Usar una suscripción** está disponible **ChatGPT Plus/Pro (Codex Subscription)**. Se puede iniciar sesión de dos maneras:

- **Código de dispositivo (recomendado):** Codewolf muestra `https://auth.openai.com/codex/device` y un código de un solo uso. Abre la URL, inicia sesión con tu cuenta de ChatGPT, escribe el código en la página y vuelve a la terminal; Codewolf detecta la autorización automáticamente.
- **Navegador con callback local:** abre el flujo de ChatGPT y recibe la autorización en `http://localhost:1455/auth/callback`. Es útil en equipos con navegador local; para SSH, contenedores o terminales remotas conviene el código de dispositivo.

Después del acceso, la sesión se guarda en `~/.codewolf/credentials.json`, se renueva automáticamente con el refresh token y el proveedor aparece en `/models`. Codewolf incluye el catálogo actual de Codex con GPT-5.6 Sol, Terra y Luna, GPT-5.5, GPT-5.4, GPT-5.4 mini y GPT-5.3 Codex Spark. La cuenta y el espacio de trabajo determinan qué modelos y límites están realmente disponibles; Spark se identifica como una opción Pro.

En **Usar una API key** puedes elegir:

- **OpenCode Go:** usa `https://opencode.ai/zen/go/v1`, guarda la clave separadamente y consulta sus modelos desde `/models`.
- **NVIDIA NIM:** usa `https://integrate.api.nvidia.com/v1`, guarda la API key y agrega los modelos conversacionales publicados por `/models`. El catálogo reconoce y enriquece modelos actuales como DeepSeek V4 Pro/Flash, GLM-5.2, Nemotron 3 Ultra/Super, MiniMax M3, Step 3.7 Flash y Mistral Medium 3.5, además de cualquier otro modelo conversacional que NVIDIA publique en su catálogo global.
- **Proveedor compatible con OpenAI:** abre el asistente general de nombre, URL base, API key y modelos.

Para cambiar de modelo, incluidos los modelos gratuitos descubiertos:

```text
/models
```

Para administrar proveedores guardados por el usuario:

```text
/providers
```

OpenCode Free y ChatGPT/Codex no aparecen en `/providers` porque son integraciones internas de solo lectura; se seleccionan desde `/models`. OpenCode Go y NVIDIA NIM sí aparecen después de autenticarlos.

NVIDIA NIM actualiza su catálogo al iniciar Codewolf y cada vez que se abre `/models`. Una respuesta exitosa de `/v1/models` es autoritativa: los modelos nuevos aparecen y los retirados dejan de mostrarse. Como ese catálogo es público y global, la validez de la API key y la disponibilidad efectiva de cada modelo se confirman al realizar una solicitud. Para evitar cierres SSE sin `finish_reason` observados en endpoints OpenAI-compatible de NIM, Codewolf solicita la respuesta completa y la adapta internamente al flujo del agente; las herramientas siguen funcionando, aunque el texto de NVIDIA se muestra al completar cada respuesta en lugar de token por token.

Para invocar el agente auxiliar con el mismo proveedor y modelo activos:

```text
/agent
```

El comando inserta `@Agent ` en el campo de entrada. No abre otro selector ni guarda una configuración independiente: el agente hereda la selección actual de `/models`, igual que los demás subagentes.

El administrador permite agregar, editar, activar y eliminar proveedores. Al editar se puede cambiar el nombre visible, la URL base, la credencial y la lista de modelos. En el paso de modelos puedes escribir identificadores separados por comas o dejar el campo vacío para consultar `GET <URL_BASE>/models`.

Para declarar el contexto máximo de un modelo manualmente, usa `modelo=tokens`. Por ejemplo:

```text
deepseek-v4-pro=1000000, modelo-local=131072
```

Cuando `/models` informa `context_length`, `context_window`, `max_context_length`, `max_model_len` o `max_position_embeddings`, Codewolf guarda ese valor automáticamente. Si no existe el dato, usa 1 000 000 para modelos cuyo ID contiene `deepseek` y 400 000 para otros proveedores personalizados.

## Compactar una conversación

Ejecuta:

```text
/compact
```

El agente resume la conversación y sustituye el historial largo por esa memoria. Además, antes de cada paso, el agente base compacta automáticamente cuando el contexto alcanza el 90 % de la ventana configurada para el modelo. Así, un modelo con un millón de tokens empieza a compactar alrededor de 900 000.

## Planificar antes de implementar

Selecciona **PLAN** desde el control de modos situado junto a DEFAULT, MAX y
LITE. No existe un comando `/plan` separado. En este modo Codewolf solo puede
leer, investigar, buscar documentación, cargar skills y hacer preguntas que
cambien decisiones importantes; no dispone de herramientas de escritura,
terminal ni agentes editores.

El resultado se presenta como un plan con contexto verificado, decisiones, pasos
numerados, archivos afectados, validación y estrategia de reversión. Desde la
tarjeta puedes **Revisar o ajustar plan** o aprobarlo para implementarlo con modo
predeterminado, máximo o ligero. Al aprobar, el agente convierte primero el plan
en una lista visible mediante `write_todos`.

## Volver a un punto anterior

Codewolf crea un checkpoint antes de cada solicitud enviada al agente. Ejecuta:

```text
/rewind
```

Selecciona el prompt anterior y después una de estas acciones:

- restaurar conversación y archivos;
- restaurar solo la conversación;
- restaurar solo los archivos.

Cuando vuelve la conversación, la solicitud original aparece de nuevo en el
campo de entrada para editarla o reenviarla. Se conservan los 100 puntos más
recientes de cada chat. Los archivos se deduplican por contenido y permanecen
dentro del directorio de la sesión.

`/rewind` restaura únicamente cambios realizados mediante `write_file`,
`str_replace` y `apply_patch`. No revierte comandos Bash, scripts, Git, MCP,
editores externos ni otros procesos. Si un archivo cambió fuera de Codewolf
después de la última edición rastreada, se omite para no sobrescribir trabajo
manual. Esta función es una red de seguridad, no un sustituto de Git.

## Sesiones con nombre y chats portables

Renombra la conversación actual desde una pantalla interactiva:

```text
/rename
```

También puedes indicar el nombre directamente:

```text
/rename Refactor de autenticación
```

El nombre aparece en `/history` y se conserva entre reinicios. `/history`
muestra primero las sesiones del proyecto actual; pulsa `Tab` para cambiar a
**Todos los proyectos**, buscar por nombre o ruta y reanudar una conversación
guardada en otro directorio. Codewolf cambia al proyecto seleccionado antes de
restaurar el chat.

Exporta la conversación actual a un archivo JSONL portable:

```text
/export
```

Codewolf propone una ruta dentro del proyecto. También puedes abrir la pantalla con una ruta inicial:

```text
/export "respaldos/chat principal.jsonl"
```

Para importar y continuar un chat:

```text
/import
```

La importación valida primero el archivo, muestra su nombre, proyecto de origen y cantidad de mensajes, y solicita confirmación antes de crear una sesión nueva en el proyecto actual. Los archivos exportados incluyen mensajes, estado del agente y nombre de sesión. No copian archivos externos ni credenciales guardadas por Codewolf, pero sí conservan cualquier texto, resultado de herramienta o fragmento de archivo que ya forme parte de la conversación; trátalos como información sensible.

## Configurar búsqueda web

```text
/setup-search
```

También están disponibles los alias `/search` y `/search-setup`.

Desde el menú puedes configurar claves, activar o desactivar motores, seleccionar el predeterminado, ordenar respaldos y probar todos los proveedores configurados.

## Consultar uso local de tokens

Dentro del editor:

```text
/usage
```

La pantalla muestra tokens de entrada, salida y total para la sesión actual, el
proyecto, los agentes y los modelos utilizados. Cuando el proveedor informa el
uso, Codewolf conserva esa cifra; cuando no lo hace, calcula los tokens
localmente. No se calculan precios ni se guardan prompts, respuestas o claves.

Las estadísticas pueden limpiarse desde la misma pantalla con `R` y se conservan
como máximo durante 90 días o 10 000 llamadas.

La barra de estado muestra permanentemente el consumo de la ventana del modelo
personalizado activo, por ejemplo `Contexto 248k/1M · 25%`. El fondo funciona
como una barra de capacidad restante: comienza llena y se vacía conforme crece
el historial. A partir del 75 % cambia a advertencia y desde el 90 % muestra
estado crítico y el recordatorio `/compact`. Esta cifra representa el contexto
actual del agente principal, no la suma histórica de llamadas mostrada por `/usage`.

## Datos persistentes

Codewolf utiliza una única carpeta en todos los modos:

```text
Windows: C:\Users\<usuario>\.codewolf
Linux:   /home/<usuario>/.codewolf
macOS:   /Users/<usuario>/.codewolf
```

Estructura principal:

```text
~/.codewolf/
├── providers.json
├── provider-auth.json
├── credentials.json
├── search.json
├── search-auth.json
├── settings.json
├── message-history.json
├── recent-projects.json
├── usage.jsonl
├── projects/
│   └── <proyecto>/
│       ├── context-summary.json
│       └── chats/<chat-id>/checkpoints/
└── skills/
```

Los archivos de autenticación no deben versionarse.

## Compilar el binario local

```bash
bun run build:binary
```

Salidas:

```text
Windows:
cli/bin/codewolf.exe
cli/bin/tree-sitter.wasm

Linux/macOS:
cli/bin/codewolf
cli/bin/tree-sitter.wasm
```

`tree-sitter.wasm` debe permanecer en la misma carpeta que el ejecutable.

## Publicar binarios multiplataforma con GitHub Actions

El workflow está en:

```text
.github/workflows/build-binaries.yml
```

Se ejecuta **únicamente de forma manual**. Después de confirmar y subir el
workflow a la rama predeterminada del repositorio:

1. Confirma y sube el workflow a la rama predeterminada del repositorio.
2. Verifica en **Settings → Actions → General** que Actions esté habilitado.
3. Abre **Actions** y selecciona **Compilar binarios y publicar release**.
4. Pulsa **Run workflow**, confirma la ejecución.

Si la interfaz todavía no muestra el botón, ejecútalo con GitHub CLI desde una
cuenta con permisos de escritura:

```bash
gh workflow run build-binaries.yml --ref main
```

Sustituye `main` si la rama predeterminada tiene otro nombre.

La primera ejecución crea la versión y etiqueta `1.0.0`. Cada ejecución
posterior localiza la etiqueta numérica más reciente e incrementa el último
segmento:

```text
1.0.0 → 1.0.1 → 1.0.2
```

Las etiquetas y releases no utilizan el prefijo `v`. El workflow usa un solo
runner Linux, reutiliza la generación de agentes y SDK, y crea paquetes para:

```text
Linux:  x64, x64 baseline, ARM64, x64 musl, x64 musl baseline y ARM64 musl
macOS:  x64, x64 baseline y ARM64
Windows: x64, x64 baseline y ARM64
```

Cada paquete incluye el ejecutable, `tree-sitter.wasm`, `LICENSE`, `NOTICE` y
`README.md`. La release también publica `SHA256SUMS.txt`, utilizado por
`install.sh` para verificar integridad.

Consulta [docs/build-binaries.md](docs/build-binaries.md) para conocer el flujo
completo y los requisitos para que GitHub muestre el botón manual.

## Validar el proyecto

Las comprobaciones locales no requieren una clave del backend:

```powershell
bun run --cwd .\common typecheck
bun run --cwd .\sdk typecheck
bun run --cwd .\cli typecheck
bun test
bun run build:sdk
bun run build:binary
```

Las pruebas E2E de agentes que hacen llamadas reales son opcionales. Solo se
ejecutan cuando se definen explícitamente `RUN_CODEBUFF_E2E=true` y
`CODEBUFF_API_KEY`; de lo contrario quedan marcadas como omitidas. Los runners
manuales de `browser-use` y `librarian` están excluidos del descubrimiento
normal de `bun test`. Consulta [docs/testing.md](docs/testing.md).

La resolución de archivos conserva la sintaxis de la ruta proporcionada por el
proyecto o filesystem virtual, por lo que la misma suite puede ejecutarse en
Windows y POSIX sin convertir `/repo/file.ts` en una ruta de unidad de Windows.
El lockfile se mantiene sincronizado para que `bun install --frozen-lockfile`
sea la instalación reproducible recomendada.
La suite también evita depender del `PATH` para lanzar Bun, no requiere Infisical para pruebas locales y serializa escrituras atómicas concurrentes en Windows.

## Estructura del monorepo

- `cli/`: interfaz TUI y experiencia interactiva.
- `sdk/`: SDK y ejecución de conversaciones.
- `common/`: tipos, herramientas y utilidades compartidas.
- `agents/`: definiciones de agentes integrados.
- `packages/agent-runtime/`: runtime y ejecución de herramientas.
- `packages/llm-providers/`: adaptadores de modelos.
- `contexto/`: memoria técnica y decisiones importantes del proyecto.

## Licencia y atribución

Codewolf fue creado y es mantenido por [YahirHub](https://github.com/YahirHub)
usando como base [Codebuff](https://github.com/CodebuffAI/codebuff).

Codebuff está publicado bajo Apache License 2.0. Esa licencia permite usar,
modificar y redistribuir el código, incluidas distribuciones comerciales,
siempre que se conserven la licencia, los avisos aplicables y la indicación de
que el trabajo fue modificado. Codewolf conserva `LICENSE` y `NOTICE`, añade su
atribución como obra modificada y empaqueta ambos archivos en cada release.
