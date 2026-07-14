# Codewolf

Codewolf es un editor y agente de programación para terminal con proveedores de modelos y motores de búsqueda configurables. El modo de desarrollo y los binarios compilados comparten toda la información persistente desde `~/.codewolf`.

## Funciones principales

- Proveedores OpenAI-compatible configurables desde `/login`.
- Selector de modelos agrupados por proveedor mediante `/models`.
- Búsqueda web multiproveedor con Tavily, Brave Search, Exa, Linkup, Firecrawl, SerpApi y Zenserp.
- Fallback automático entre motores de búsqueda configurados.
- Skills globales en `~/.codewolf/skills` y skills locales en `.codewolf/skills`.
- Conversaciones y configuración compartidas entre desarrollo y binarios.
- Binarios independientes para Windows y Linux.

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

## Configurar búsqueda web

```text
/setup-search
```

También están disponibles los alias `/search` y `/search-setup`.

Desde el menú puedes configurar claves, activar o desactivar motores, seleccionar el predeterminado, ordenar respaldos y probar todos los proveedores configurados.

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

## Compilar Windows y Linux con GitHub Actions

El workflow está en:

```text
.github/workflows/build-binaries.yml
```

Se ejecuta únicamente:

- Manualmente desde la pestaña **Actions**.
- Al publicar una etiqueta `v*`, por ejemplo `v1.0.0`.

Usa un solo runner Linux, compila Linux nativamente y genera Windows x64 mediante cross-compilation para evitar un segundo runner. El artefacto contiene:

```text
codewolf-linux-x64.tar
codewolf-windows-x64.zip
SHA256SUMS.txt
```

Consulta [docs/build-binaries.md](docs/build-binaries.md) para conocer el flujo completo.

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
