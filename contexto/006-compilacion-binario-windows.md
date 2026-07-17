# 006 - Compilación del binario en Windows

## Problema

El script `cli/scripts/build-binary.ts` ejecutaba procesos secundarios usando el nombre literal `bun`. En Windows, `spawnSync` podía no resolver el ejecutable y devolver un estado nulo o indefinido, produciendo el mensaje `exit code undefined` antes de generar los agentes.

También existían dos inconsistencias adicionales:

- La compilación del SDK dependía de una forma ambigua de `--cwd`.
- El argumento para incluir variables `NEXT_PUBLIC_*` contenía comillas literales al ejecutarse sin shell.
- El script intentaba descargar una segunda copia del paquete nativo de OpenTUI aunque ya estuviera instalado en `node_modules` de la raíz.

## Solución

- Se reutiliza `process.execPath`, que apunta al mismo ejecutable `bun.exe` que inició el proceso.
- Los errores de creación de procesos ahora muestran el error real (`ENOENT`, permisos u otra causa), además de stdout y stderr.
- El SDK se compila estableciendo directamente su carpeta como directorio de trabajo.
- Se utiliza `--env=NEXT_PUBLIC_*` sin comillas literales.
- OpenTUI se busca tanto en el workspace del CLI como en `node_modules` de la raíz y no se vuelve a descargar si ya está disponible.
- Se agregó el comando raíz `bun run build:binary`.

## Resultado esperado

Desde la raíz del repositorio:

```powershell
bun run build:binary
```

En Windows se generan:

```text
cli\bin\codebuff.exe
cli\bin\tree-sitter.wasm
```

Los dos archivos deben distribuirse juntos.

## Validaciones

- Typecheck de CLI, Common y SDK.
- Generación de agentes.
- Compilación completa del SDK.
- Detección local del paquete nativo de OpenTUI.
- Compilación completa de un binario independiente y copia de `tree-sitter.wasm`.
