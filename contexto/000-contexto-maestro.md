# 000 — Leer primero: contexto maestro de Codewolf

# Fecha

2026-07-17

# Objetivo

Este archivo es la puerta de entrada obligatoria para continuar Codewolf desde
un ZIP en una conversación o entorno nuevo. Resume las reglas de trabajo, el
estado funcional actual, la arquitectura y el orden correcto de lectura.

# Protocolo para retomar el proyecto

1. Leer este archivo completo.
2. Leer `README.md` y `AGENTS.md`.
3. Leer los archivos de `contexto/` en orden numérico.
4. Revisar el código relacionado con la tarea antes de modificarlo.
5. Si el código contradice un documento antiguo, prevalece el código y el
   documento de contexto con numeración más alta; registrar la corrección.
6. No asumir que el ZIP contiene dependencias, credenciales, binarios ni `.git`.
7. Después de un cambio importante, crear el siguiente archivo numerado en
   `contexto/` y actualizar este resumen si cambia el estado global.

# Metodología de trabajo

- Actuar como arquitecto, programador senior, auditor, DevOps básico y
  documentador.
- Aplicar simplicidad Ponytail: resolver con la menor complejidad razonable sin
  eliminar seguridad, validaciones, manejo de errores ni pruebas críticas.
- Preferir librería estándar, capacidades nativas y dependencias ya instaladas.
- No crear capas, interfaces o configuración especulativa.
- Investigar documentación oficial cuando una decisión dependa de versiones,
  APIs, seguridad, compatibilidad o servicios actuales.
- Los commits, documentación técnica y entregas se redactan en español.
- Cada entrega debe indicar resumen, archivos, comandos, dependencias,
  arquitectura, pruebas, commit, riesgos y siguientes pasos.

# Plantilla obligatoria para nuevos archivos de contexto

Cada cambio importante debe crear el siguiente archivo numerado y conservar
esta estructura mínima:

```text
# <número> — <título técnico breve>
# Fecha
# Objetivo
# Archivos importantes modificados
# Soluciones implementadas

- Se eliminó el workspace Freebuff, 163 archivos obsoletos, dependencias directas sin uso y ramas comerciales; se conservaron los namespaces activos del SDK y las atribuciones legales.
Secciones opcionales cuando exista información confirmada:
# Decisiones tomadas
# Arquitectura actual
# Librerías usadas
# Problemas encontrados

- OpenCode Free se integra temporalmente como catálogo de solo lectura sin API key: consulta modelos terminados en `-free`, usa caché/fallback y aparece en `/models`. `/login` separa el método de autenticación y permite configurar OpenCode Go con su endpoint y clave propios.
- El onboarding de primera ejecución registra su versión, ofrece suscripción/proveedor/OpenCode Free, muestra branding animado adaptable y evita mostrarse retroactivamente a usuarios con estado previo. Su decisión se captura antes de que el arranque cree `recent-projects.json`; `--onboarding` permite reabrirlo sin borrar datos. La presentación usa `AnimatedCodewolfLogo`, tarjetas seleccionables y un modo compacto compatible con terminales de 80x24.
- El instalador y workflow comparten nombres deterministas de assets para actualizar de forma verificable en Linux, macOS y Windows.
- NVIDIA NIM se configura desde `/login`, guarda la clave únicamente en `provider-auth.json`, actualiza el catálogo global de modelos al iniciar y abrir `/models`, y usa solicitudes no SSE adaptadas al contrato de streaming interno para mantener estables las herramientas.

# Pendientes
# Próximos pasos
```

No se deben guardar secretos, tokens, claves API ni datos personales en
`contexto/`. Cuando una prueba no pueda ejecutarse, debe registrarse de forma
explícita junto con el comando que falta ejecutar.

# Arquitectura actual

Codewolf es un editor de programación en terminal construido como monorepo
TypeScript con Bun, React y OpenTUI.

- `cli/`: interfaz TUI, comandos interactivos y persistencia local.
- `sdk/`: ejecución de conversaciones y límite público del runtime.
- `common/`: contratos, utilidades y búsqueda web multiproveedor.
- `agents/`: agentes integrados.
- `packages/agent-runtime/`: herramientas, subagentes y ciclo de ejecución.
- `packages/llm-providers/`: adaptadores de proveedores de modelos.
- `contexto/`: memoria técnica persistente del proyecto.

# Estado funcional actual

- Marca visible y binarios: `Codewolf`, `codewolf`, `codewolf.exe`.
- Proveedores de modelos configurables mediante `/login`, incluida una suscripción ChatGPT/Codex por código de dispositivo o callback local.
- ChatGPT Plus/Pro (Codex Subscription) integrado mediante OAuth, con código de dispositivo recomendado, callback local alternativo, renovación automática y modelos Codex seleccionables desde `/models`.
- NVIDIA NIM integrado mediante API key, catálogo dinámico de `/v1/models` y transporte JSON completo para evitar streams sin `finish_reason`.
- Selector agrupado mediante `/models`.
- Proveedor y modelo personalizados propagados a agente principal y subagentes.
- Cada tarea congela el proveedor y modelo con los que comenzó; cambiar `/models` durante una ejecución solo afecta la siguiente tarea y la barra distingue el modelo en uso del siguiente seleccionado.
- `/config` permite asignar modelos independientes a agentes OPUS, revisión de código, investigación, `code-searcher`, `file-picker` y `file-lister`. Las preferencias vacías heredan el modelo de sesión seleccionado en `/models`, incluso en subagentes anidados.
- `/config` también separa Modo seguro local, Modo seguro SSH y protección de `.env`; SSH y `.env` quedan protegidos por defecto, mientras el modo local conserva su valor desactivado.
- `ssh_remote` administra un registro global de servidores en `~/.codewolf/ssh-servers.json` con nombres, edición, referencias `ssh-server://<id>` y reconexión desde cualquier proyecto. Las conexiones activas siguen siendo múltiples y persistentes durante el proceso, entregan `ssh://<id>`, conservan directorio/shell PTY, usan SFTP y pueden cerrarse individualmente o en conjunto. PLAN no recibe esta herramienta.
- `/agent` inserta el agente auxiliar genérico `@Agent`, que hereda el proveedor/modelo activo de `/models` sin configuración independiente.
- Búsqueda local multiproveedor mediante `/setup-search` con Tavily, Brave,
  Exa, Linkup, Firecrawl, SerpApi y Zenserp.
- Fallback automático y orden configurable de motores.
- Protección contra sesiones cíclicas y esquemas de herramientas no
  serializables.
- Deduplicación, timeout y cierre garantizado de investigadores web.
- Persistencia compartida por desarrollo y binario bajo `~/.codewolf`.
- Skills globales en `~/.codewolf/skills` y locales en
  `<proyecto>/.codewolf/skills`.
- Interfaz visible en español; comandos e identificadores técnicos permanecen
  estables.
- La edición personalizada no vende una suscripción propia ni ofrece anuncios,
  créditos o diálogos de compra; sí puede autenticar una suscripción externa de
  ChatGPT/Codex elegida por el usuario. No reintroducir `/subscribe`, `/ads:enable`,
  `/ads:disable` ni sus alias comerciales. `/usage` está reservado para
  estadísticas técnicas locales de tokens, sin precios ni cuotas.
- Estadísticas locales mediante `/usage`, con cifras informadas por el proveedor
  cuando existen y cálculo local cuando no existen.
- `/compact` resume manualmente una sesión; Base2 compacta automáticamente al
  90 % del contexto máximo configurado o descubierto para el modelo.
- Las sesiones heredadas con `role`/`content` nulos se normalizan al reanudarse,
  y los metadatos del proveedor no pueden sobrescribir campos del protocolo.
- `/history` abre el historial del proyecto actual y `Tab` cambia a una vista
  global de rutas conocidas; al reanudar otra ruta cambia el proyecto, reinicia
  el cliente y recarga agentes, MCP y skills antes de restaurar la sesión.
- La barra inferior permanece visible con un modelo personalizado activo y
  muestra contexto usado/máximo, porcentaje y capacidad restante; se alimenta
  del agente principal y baja inmediatamente después de `/compact`.
- Los commits verificados generan primero un mensaje semántico local basado en el diff y pueden completarse aunque el proveedor falle; los cambios de contexto se nombran como creación o actualización de contexto.
- Los commits verificados mantienen un backlog persistente por proyecto: elegir **No crear commit** conserva los archivos seguros y el siguiente commit confirmado acumula todas las implementaciones pendientes cuyas huellas SHA-256 no cambiaron manualmente.
- Con contexto persistente activo, las implementaciones con cambios reales garantizan la creación o actualización de un registro numerado y del contexto maestro. Los registros normales se generan localmente sin otra llamada al proveedor, con títulos técnicos breves, filtrado de metatexto y secciones opcionales solo cuando existen hechos confirmados. `/init` puede enriquecer el análisis mediante una única salida estructurada y siempre conserva un fallback local.
- La terminal normaliza wrappers `cd` incompatibles entre Windows, Git Bash y WSL, y `basher` devuelve el resultado sin una segunda llamada al proveedor.
- `bun test` omite las E2E de agentes sin habilitación explícita y excluye los runners manuales de browser-use/librarian; los typechecks de CLI son compatibles con Bun 1.3.14.
- Las instalaciones nuevas muestran onboarding con atribución, acceso por suscripción, proveedor personalizado u OpenCode Free; los usuarios existentes se migran sin interrumpir su configuración.
- `install.sh` instala o actualiza desde la release `latest`, verifica SHA-256 y respalda `~/.codewolf` antes de reemplazar una instalación existente.

# Persistencia

```text
~/.codewolf/
├── providers.json
├── provider-auth.json
├── credentials.json
├── search.json
├── search-auth.json
├── settings.json
├── ssh-servers.json
├── message-history.json
├── recent-projects.json
├── usage.jsonl
├── projects/
└── skills/
```

Windows usa `C:\Users\<usuario>\.codewolf`; Linux usa
`/home/<usuario>/.codewolf`.

# Build y releases

- Desarrollo: `bun run dev`.
- Typecheck del CLI: `bun run --cwd ./cli typecheck` o `cd cli && bun run typecheck`.
- Binario local: `bun run build:binary`.
- Workflow: `.github/workflows/build-binaries.yml`.
- Ejecución exclusivamente manual mediante `workflow_dispatch`.
- El workflow solo muestra su botón cuando el archivo ya existe en la rama
  predeterminada y GitHub Actions está habilitado.
- Primera release: `1.0.0`; cada ejecución incrementa el parche y usa etiquetas
  estrictamente numéricas, sin prefijo `v`.
- Targets: Linux x64/ARM64 glibc y musl, macOS x64/ARM64 y Windows x64/ARM64; las variantes x64 baseline cubren CPU sin AVX2.
- Cada paquete incluye ejecutable, `tree-sitter.wasm`, `LICENSE`, `NOTICE` y `README.md`, además de `SHA256SUMS.txt` global.

# Librerías usadas

- Bun `1.3.14`.
- TypeScript.
- React.
- OpenTUI.
- Zod.
- TanStack Query.
- `ssh2` y `@types/ssh2` para SSH, PTY y SFTP persistentes.

Consultar `package.json`, los `package.json` de workspaces y `bun.lock` para la
lista exacta y versiones bloqueadas.

# Archivos importantes modificados

- `cli/src/utils/custom-providers.ts`
- `cli/src/components/provider-login-screen.tsx`
- `cli/src/components/model-selector-screen.tsx`
- `common/src/web-search/`
- `cli/src/components/search-setup-screen.tsx`
- `scripts/cleanup-codewolf-obsolete.ps1`
- `packages/agent-runtime/src/tools/handlers/tool/`
- `cli/src/utils/sdk-event-handlers.ts`
- `cli/src/scripts/build-binary.ts`
- `cli/src/components/first-run-onboarding-screen.tsx`
- `cli/src/utils/first-run-onboarding.ts`
- `install.sh`
- `docs/install.md`
- `.github/workflows/build-binaries.yml`
- `AGENTS.md`
- `README.md`
- `common/src/types/token-usage.ts`
- `sdk/src/impl/token-usage.ts`
- `cli/src/utils/token-usage.ts`
- `cli/src/components/token-usage-screen.tsx`
- `cli/src/components/provider-manager-screen.tsx`
- `cli/src/utils/chat-transfer.ts`
- `cli/src/components/chat-transfer-screen.tsx`
- `cli/src/utils/session-name.ts`
- `agents/context-pruner.ts`
- `packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages.ts`
- `common/src/util/messages.ts`
- `sdk/src/run-state.ts`
- `cli/src/components/chat-history-screen.tsx`
- `cli/src/utils/chat-history.ts`
- `cli/src/utils/recent-projects.ts`
- `cli/src/components/status-bar.tsx`
- `cli/src/utils/context-window.ts`
- `cli/src/state/chat-store.ts`
- `cli/src/utils/verified-commit.ts`
- `cli/src/utils/project-context-maintenance.ts`
- `cli/src/components/verified-commit-screen.tsx`
- `cli/src/commands/init.ts`
- `agents/basher.ts`
- `sdk/src/tools/run-terminal-command.ts`
- `packages/llm-providers/src/openai-compatible/openai-compatible-error.ts`
- `cli/src/providers/openai-codex-catalog.ts`
- `cli/src/components/chatgpt-codex-login-screen.tsx`
- `cli/src/utils/chatgpt-oauth.ts`
- `common/src/constants/chatgpt-oauth.ts`
- `cli/src/providers/nvidia-nim-catalog.ts`
- `cli/src/utils/nvidia-nim-provider.ts`
- `cli/src/utils/provider-catalogs.ts`
- `packages/llm-providers/src/openai-compatible/chat/openai-compatible-chat-language-model.ts`
- `common/src/tools/params/tool/ssh-remote.ts`
- `common/src/util/protected-env.ts`
- `common/src/util/tool-permission.ts`
- `sdk/src/tools/ssh-remote.ts`
- `sdk/src/tools/ssh-server-store.ts`
- `sdk/src/tools/read-files.ts`
- `sdk/src/tools/code-search.ts`
- `cli/src/components/config-screen.tsx`
- `cli/src/components/tool-permission-screen.tsx`
- `cli/scripts/build-binary.ts`
- `docs/ssh-remote.md`

# Problemas encontrados

- Codewolf no tenía una herramienta SSH persistente: repetir procesos locales `ssh` no conservaba de forma segura varias conexiones, SFTP, directorio ni shell entre llamadas del agente.
- La cola y pantalla de permisos existentes no estaban conectadas de extremo a extremo al SDK para operaciones SSH ni para proteger contenido `.env` en modo normal.
- Una detección de secretos basada solo en menciones podía confundir navegación o metadatos con lectura real de contenido.
- El workspace Freebuff, sus variantes de agentes, superficies comerciales y wrappers de release seguían presentes aunque ya no eran alcanzables desde Codewolf.
- La generación automática de contexto podía copiar solicitudes largas y respuestas completas en nombres y contenido, además de consumir una llamada adicional al proveedor en cada implementación.
- El backend original no es una dependencia válida para proveedores, búsqueda,
  créditos ni suscripciones de esta edición.
- Los subagentes podían perder el proveedor personalizado.
- Algunos gateways reproducían tool calls y creaban investigaciones duplicadas.
- Esquemas Zod vivos podían introducir ciclos en la sesión.
- Un investigador sin cierre podía bloquear el turno principal.
- GitHub no muestra la ejecución manual si el workflow no está en la rama
  predeterminada, está deshabilitado o Actions está desactivado.
- La compactación existente usaba umbrales fijos y `/compact` no estaba
  registrado como comando real.
- Metadatos OpenAI-compatible podían sobrescribir `role` o `content` con `null`
  y envenenar todos los turnos posteriores de una sesión.
- El atajo heredado `/agent:gpt-5` y la identidad `GPT-5 Agent` vinculaban una función genérica a un modelo concreto, aunque los proveedores personalizados sustituyen globalmente el modelo de todos los subagentes.
- La compactación manual reemplazaba el historial dentro de `runAgentStep` antes
  de construir la salida final. Como la memoria compactada queda correctamente
  como un único mensaje `user`, el extractor genérico `last_message` no hallaba
  un mensaje `assistant` y mostraba el falso error `No response from agent`.
- `/history` solo conocía sesiones de la ruta activa, el registro de proyectos
  descartaba rutas antiguas y un cambio de proyecto en el mismo proceso podía
  conservar agentes o skills del directorio anterior.
- El total acumulado de `/usage` no representa la ventana de contexto porque
  repite el historial en cada llamada e incluye subagentes; además el conteo
  persistido quedaba una respuesta por detrás y no descendía al terminar
  `/compact`.
- El modo PLAN dependía de instrucciones para no editar y convivía con un
  comando `/plan` redundante; las sesiones tampoco podían volver de forma
  coordinada a un mensaje anterior y a los archivos modificados por el agente.
- La metodología de trabajo y la memoria `contexto/` dependían de instrucciones manuales fuera del CLI; tampoco existía una confirmación segura que pidiera probar una implementación antes de crear un commit limitado a sus archivos.
- El redactor de commits podía aceptar `Guardar cambios verificados` y limitar la descripción a enumerar archivos, sin representar el trabajo real.
- En Windows, el agente podía anteponer una ruta `C:\\...` a un comando ejecutado por Bash; además `basher` hacía una segunda petición al modelo después del proceso y una caída `Upstream request failed` ocultaba el resultado de terminal.
- Las herramientas del SDK aplicaban la sintaxis de rutas del sistema anfitrión a filesystems virtuales; en Windows esto convertía rutas POSIX de pruebas en `C:\\repo\...` y provocaba fallos masivos de lectura, parches y contexto.

# Soluciones implementadas

- Se añadió `ssh_remote` como herramienta interna con múltiples conexiones en memoria, referencias reutilizables, navegación, lectura, comandos, PTY persistente, SFTP y cierre individual/global.
- El SDK aplica permisos antes de ejecutar herramientas locales, externas o SSH, conserva la identidad del agente/subagente y exige autorizaciones separadas cuando una operación remota también puede exponer un `.env`.
- `/config` expone políticas independientes; la protección `.env` analiza si la operación puede exponer contenido y excluye búsquedas amplias sin bloquear simples metadatos.
- Se eliminó el workspace Freebuff, 163 archivos obsoletos, dependencias directas sin uso y ramas comerciales; se conservaron los namespaces activos del SDK y las atribuciones legales.
- El mantenimiento de contexto normal ahora es determinista y local: limita títulos, filtra Markdown y metatexto, conserva solo viñetas técnicas y omite secciones sin información real.
- Proveedores y búsqueda se ejecutan localmente con configuración separada de
  credenciales.
- El contexto del proveedor se propaga a todos los subagentes.
- El estado del SDK se normaliza a JSON plano.
- Tool calls e investigadores se deduplican semánticamente.
- Los investigadores tienen cancelación y tiempo máximo.
- El workflow tiene un formulario manual explícito y publica releases solo
  después de validar Linux y Windows.
- Se retiraron las superficies activas de anuncios, créditos y suscripciones.
- `/usage` fue recuperado con un significado exclusivamente técnico y local: registra tokens, no facturación.
- `/providers` administra proveedores sin exponer claves y permite actualizar modelos manualmente o mediante `/models`.
- `/rename`, `/export` y `/import` permiten nombrar y transferir sesiones con un archivo JSONL portable.
- `/compact` y `context-pruner` conservan conversaciones largas dentro del 90 %
  de la ventana del modelo; el compactador también estima el historial actual
  para detectar prompts nuevos grandes antes de la siguiente llamada.
- Los campos reservados del protocolo quedan protegidos frente a metadatos del
  proveedor y los historiales dañados se reparan antes de reproducirse.
- El atajo se simplificó a `/agent`; inserta `@Agent`, usa el ID estable `agent` y hereda directamente la selección global de `/models`, sin selector ni persistencia por agente.
- La compactación manual se confirma al terminar todo el turno y devuelve el
  resumen generado como salida exitosa, independientemente de que el historial
  persistido ya no contenga un mensaje `assistant`. Si el resumen está vacío,
  restaura el historial exacto anterior y avisa sin bloquear el chat.
- `/history` alterna con `Tab` entre el proyecto actual y todos los proyectos
  conocidos, permite buscar por ruta y cambia de directorio de forma segura antes
  de reanudar; el registro conserva todas las rutas existentes y las extensiones
  específicas del proyecto se recargan al cambiar.
- La barra de estado usa el contexto actual del agente principal frente a la
  ventana del modelo; permanece visible, se vacía según capacidad restante,
  advierte desde 75 %, recuerda `/compact` desde 80 % y recalcula el conteo al
  final de cada paso y después de compactar.
- PLAN se selecciona únicamente desde el control de modos, queda restringido a
  capacidades de lectura/investigación y genera planes implementables con
  validación y reversión. `/rewind` crea hasta 100 checkpoints por chat antes de
  cada prompt y permite restaurar conversación, archivos estructuralmente
  editados o ambos sin sobrescribir cambios externos detectados.
- `/config` habilita de forma independiente el contexto persistente y los commits verificados. `contexto/*.md` se resume con un agente de solo lectura y caché por huella, se inyecta como conocimiento virtual, y el agente actualiza documentos numerados tras cambios importantes. Los commits solo se crean después de una confirmación explícita, se limitan a mutaciones estructuradas que estaban limpias al iniciar el turno y rechazan staging o cambios externos.

- Las operaciones sobre filesystems inyectados resuelven rutas según su propia sintaxis POSIX o Win32, independientemente del sistema anfitrión; la suite local excluye integraciones externas mediante `pathIgnorePatterns`.
- La suite local de Windows usa `process.execPath` para procesos de Bun, entorno de pruebas autónomo, escrituras atómicas serializadas y expectativas alineadas con la interfaz española; las integraciones externas se separan por rutas explícitas.

- OpenCode Free se integra temporalmente como catálogo de solo lectura sin API key: consulta modelos terminados en `-free`, usa caché/fallback y aparece en `/models`. `/login` separa el método de autenticación y permite configurar OpenCode Go con su endpoint y clave propios.
- El onboarding de primera ejecución registra su versión, ofrece suscripción/proveedor/OpenCode Free, muestra branding animado adaptable y evita mostrarse retroactivamente a usuarios con estado previo.
- El instalador y workflow comparten nombres deterministas de assets para actualizar de forma verificable en Linux, macOS y Windows.

# Pendientes

- Ejecutar el workflow desde la rama predeterminada y verificar una release real.
- Probar las APIs de búsqueda con claves reales y cuotas activas.
- Mantener las pruebas E2E reales como ejecución explícita con credenciales; la suite local no debe depender del backend.
- Evaluar una migración futura del namespace interno `@codebuff/*` sin romper
  workspaces ni compatibilidad.
- Probar `ssh_remote` contra servidores controlados Linux/Windows y ejecutar la suite completa y el binario en un entorno con todas las dependencias del monorepo.

# Próximos pasos

Para cualquier tarea nueva, identificar primero el último documento de contexto
relacionado, validar el estado en código y crear el siguiente archivo numerado
al terminar.

# Índice de contexto

- `001`: proveedores personalizados.
- `002`: configuración interactiva de proveedores.
- `003`: CLI sin `.env` obligatorio.
- `004`: serialización JSON cíclica.
- `005`: segundo turno y esquemas de herramientas.
- `006`: compilación del binario en Windows.
- `007`: directorio global `~/.codewolf`.
- `008`: búsqueda web multiproveedor.
- `009`: proveedor personalizado en subagentes.
- `010`: bloqueos de investigadores.
- `011`: deduplicación de subagentes reproducidos.
- `012`: marca Codewolf y workflow de binarios.
- `013`: releases numéricas y diálogos en español.
- `014`: contexto persistente, workflow manual y edición sin monetización.
- `015`: estadísticas locales de tokens.
- `016`: administración de proveedores y sesiones portables.
- `017`: compactación al 90 % y recuperación de sesiones con mensajes nulos.
- `018`: corrección del falso `No response from agent` después de `/compact`.
- `019`: agente genérico `/agent` con herencia del modelo activo global.
- `020`: historial global de proyectos y reanudación entre rutas con `Tab`.
- `021`: medidor permanente de uso y capacidad restante de contexto.
- `022`: modo PLAN seguro y checkpoints de conversación/archivos con `/rewind`.
- `023`: metodología opcional, resumen automático de `contexto/` y commits verificados.
- `024`: commits semánticos, terminal multiplataforma y reintentos upstream.
- `025`: acumulación segura de commits y mantenimiento garantizado de contexto.
- `026`: contexto técnico conciso generado localmente.
- `027`: eliminación de Freebuff y código obsoleto no alcanzable.
- `028`: typechecks corregidos y separación entre pruebas locales y E2E con credenciales.
- `029`: rutas virtuales portables, descubrimiento correcto de pruebas y lockfile sincronizado.
- `030`: suite local de Windows, entorno autónomo y escrituras atómicas serializadas.
- `031`: OpenCode Free integrado y autenticación OpenCode Go desde `/login`.
- `032`: NVIDIA NIM con catálogo dinámico, modelos actuales y transporte estable sin SSE.
- `033`: login ChatGPT/Codex por suscripción, código de dispositivo y OAuth.
- `034`: onboarding, instalador con respaldo y releases multiplataforma.
- `035`: corrección del orden de detección del onboarding y opción `--onboarding`.
- `036`: rediseño visual del onboarding y componente reutilizable de branding animado.
- `037`: consistencia del cambio de modelo entre la tarea activa y la siguiente.
- `038`: modelos configurables para búsqueda de código y exploración de archivos.
- `039`: conexiones SSH persistentes, permisos remotos y protección independiente de `.env`.

<!-- codewolf:auto-context:start -->
# Estado automático más reciente

- Última actualización: 2026-07-17T18:07:14.696Z
- Último registro: contexto/043-actualizar-informe-md.md
- Resumen: Actualizar informe.md.
- Archivos del cambio: informe.md
<!-- codewolf:auto-context:end -->
