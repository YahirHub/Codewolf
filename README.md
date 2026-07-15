# Codewolf

Codewolf es un editor y agente de programación para terminal con proveedores de modelos y motores de búsqueda configurables. El modo de desarrollo y los binarios compilados comparten toda la información persistente desde `~/.codewolf`.

## Funciones principales

- Proveedores OpenAI-compatible configurables desde `/login` y administrables con `/providers`.
- Selector de modelos agrupados por proveedor mediante `/models`.
- Agente auxiliar genérico mediante `/agent`, usando el modelo activo de la sesión.
- Búsqueda web multiproveedor con Tavily, Brave Search, Exa, Linkup, Firecrawl, SerpApi y Zenserp.
- Fallback automático entre motores de búsqueda configurados.
- Estadísticas locales de tokens por sesión, proyecto, agente y modelo mediante `/usage`.
- Skills globales en `~/.codewolf/skills` y skills locales en `.codewolf/skills`.
- Conversaciones con nombre visible, historial, exportación e importación portable.
- Compactación manual con `/compact` y compactación automática al 90 % del contexto del modelo.
- Conversaciones y configuración compartidas entre desarrollo y binarios.
- Binarios independientes para Windows y Linux.

## Retomar el proyecto desde un ZIP

La memoria técnica vive en `contexto/`. Al iniciar en otro entorno o
conversación, el orden obligatorio es:

1. `contexto/000-contexto-maestro.md`
2. `README.md`
3. `AGENTS.md`
4. El resto de `contexto/` en orden numérico
5. El código relacionado con la tarea

Cada cambio importante debe crear el siguiente documento numerado. Así el ZIP
del proyecto contiene suficiente información para continuar sin depender del
historial de una sesión anterior.

## Edición personalizada

Codewolf usa proveedores y motores configurados por el usuario. Esta edición no
expone anuncios, créditos, suscripciones ni enlaces de compra. Los comandos
`/subscribe`, `/ads:enable`, `/ads:disable` y sus alias comerciales no forman
parte del CLI. `/usage` existe únicamente para mostrar estadísticas técnicas
locales de tokens; no consulta saldo, cuotas, precios ni servicios comerciales.

## Requisitos de desarrollo

- Bun `1.3.14`.
- Git.

La versión requerida de Bun también está declarada en `.bun-version` y `package.json`.

## Instalar dependencias

Desde la raíz:

```bash
bun install --frozen-lockfile
```

## Ejecutar en desarrollo

```bash
bun run dev
```

No se requiere un archivo `.env` para utilizar proveedores personalizados.

## Configurar modelos

Dentro del editor:

```text
/login
```

El asistente solicita el nombre del proveedor, la URL base, la API key y los modelos. Si dejas vacío el campo de modelos, Codewolf consulta automáticamente el endpoint `/models` del proveedor.

Para cambiar de modelo:

```text
/models
```

Para administrar todos los proveedores:

```text
/providers
```

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
├── search.json
├── search-auth.json
├── settings.json
├── message-history.json
├── recent-projects.json
├── usage.jsonl
├── projects/
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

## Publicar Windows y Linux con GitHub Actions

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
runner Linux, reutiliza la misma instalación para ambos sistemas y genera:

```text
codewolf-linux-x64.tar.gz
codewolf-windows-x64.zip
SHA256SUMS.txt
```

Consulta [docs/build-binaries.md](docs/build-binaries.md) para conocer el flujo
completo y los requisitos para que GitHub muestre el botón manual.

## Estructura del monorepo

- `cli/`: interfaz TUI y experiencia interactiva.
- `sdk/`: SDK y ejecución de conversaciones.
- `common/`: tipos, herramientas y utilidades compartidas.
- `agents/`: definiciones de agentes integrados.
- `packages/agent-runtime/`: runtime y ejecución de herramientas.
- `packages/llm-providers/`: adaptadores de modelos.
- `contexto/`: memoria técnica y decisiones importantes del proyecto.

## Licencia y atribución

Este proyecto conserva los archivos `LICENSE` y `NOTICE` del código base del que deriva. Las atribuciones legales deben mantenerse al redistribuirlo.
