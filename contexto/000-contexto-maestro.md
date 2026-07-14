# 000 — Leer primero: contexto maestro de Codewolf

# Fecha

2026-07-14

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
# <número> — <título>
# Fecha
# Objetivo
# Decisiones tomadas
# Arquitectura actual
# Librerías usadas
# Archivos importantes modificados
# Problemas encontrados
# Soluciones implementadas
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
- Proveedores de modelos configurables mediante `/login`.
- Selector agrupado mediante `/models`.
- Proveedor y modelo personalizados propagados a agente principal y subagentes.
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
- La edición personalizada no ofrece anuncios, créditos, suscripciones ni
  diálogos de compra. No reintroducir `/subscribe`, `/ads:enable`,
  `/ads:disable` ni sus alias comerciales. `/usage` está reservado para
  estadísticas técnicas locales de tokens, sin precios ni cuotas.
- Estadísticas locales mediante `/usage`, con cifras informadas por el proveedor
  cuando existen y cálculo local cuando no existen.

# Persistencia

```text
~/.codewolf/
├── providers.json
├── provider-auth.json
├── search.json
├── search-auth.json
├── settings.json
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

# Librerías usadas

- Bun `1.3.14`.
- TypeScript.
- React.
- OpenTUI.
- Zod.
- TanStack Query.

Consultar `package.json`, los `package.json` de workspaces y `bun.lock` para la
lista exacta y versiones bloqueadas.

# Archivos importantes modificados

- `cli/src/utils/custom-providers.ts`
- `cli/src/components/provider-login-screen.tsx`
- `cli/src/components/model-selector-screen.tsx`
- `common/src/web-search/`
- `cli/src/components/search-setup-screen.tsx`
- `scripts/cleanup-commercial-cli.py`
- `packages/agent-runtime/src/tools/handlers/tool/`
- `cli/src/utils/sdk-event-handlers.ts`
- `cli/src/scripts/build-binary.ts`
- `.github/workflows/build-binaries.yml`
- `AGENTS.md`
- `README.md`
- `common/src/types/token-usage.ts`
- `sdk/src/impl/token-usage.ts`
- `cli/src/utils/token-usage.ts`
- `cli/src/components/token-usage-screen.tsx`

# Problemas encontrados

- El backend original no es una dependencia válida para proveedores, búsqueda,
  créditos ni suscripciones de esta edición.
- Los subagentes podían perder el proveedor personalizado.
- Algunos gateways reproducían tool calls y creaban investigaciones duplicadas.
- Esquemas Zod vivos podían introducir ciclos en la sesión.
- Un investigador sin cierre podía bloquear el turno principal.
- GitHub no muestra la ejecución manual si el workflow no está en la rama
  predeterminada, está deshabilitado o Actions está desactivado.

# Soluciones implementadas

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

# Pendientes

- Ejecutar el workflow desde la rama predeterminada y verificar una release real.
- Probar las APIs de búsqueda con claves reales y cuotas activas.
- Auditar y retirar módulos heredados que ya no sean alcanzables, en un cambio
  separado y con pruebas de regresión.
- Evaluar una migración futura del namespace interno `@codebuff/*` sin romper
  workspaces ni compatibilidad.

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
