# Compilar y publicar binarios de Codewolf

## Compilación local

Desde la raíz del repositorio:

```bash
bun install --frozen-lockfile
bun run build:binary
```

El sistema operativo actual determina la salida:

- Windows: `cli/bin/codewolf.exe`
- Linux/macOS: `cli/bin/codewolf`
- Complemento obligatorio: `cli/bin/tree-sitter.wasm`

`tree-sitter.wasm` debe permanecer junto al ejecutable.

## Targets de release

El workflow genera doce paquetes:

```text
codewolf-linux-x64.tar.gz
codewolf-linux-x64-baseline.tar.gz
codewolf-linux-arm64.tar.gz
codewolf-linux-x64-musl.tar.gz
codewolf-linux-x64-musl-baseline.tar.gz
codewolf-linux-arm64-musl.tar.gz
codewolf-darwin-x64.tar.gz
codewolf-darwin-x64-baseline.tar.gz
codewolf-darwin-arm64.tar.gz
codewolf-windows-x64.zip
codewolf-windows-x64-baseline.zip
codewolf-windows-arm64.zip
SHA256SUMS.txt
```

Las variantes baseline funcionan en CPU x64 anteriores a AVX2. Las variantes
musl están destinadas a Alpine, Void y otras distribuciones sin glibc.

Cada archivo contiene:

- `codewolf` o `codewolf.exe`;
- `tree-sitter.wasm`;
- `LICENSE`;
- `NOTICE`;
- `README.md`.

## Ejecución manual

El workflow está en `.github/workflows/build-binaries.yml` y utiliza únicamente
`workflow_dispatch`.

1. Confirma el workflow en la rama predeterminada.
2. Habilita Actions y permisos **Read and write** para workflows.
3. Abre **Actions → Compilar binarios y publicar release**.
4. Pulsa **Run workflow**.

Alternativa con GitHub CLI:

```bash
gh workflow run build-binaries.yml --ref main
```

## Versionado

El workflow busca etiquetas que coincidan exactamente con `X.Y.Z`. Si no
existe ninguna publica `1.0.0`; de lo contrario incrementa el parche de la más
reciente. No usa prefijo `v`.

La etiqueta se crea únicamente después de compilar, empaquetar, ejecutar el
smoke test Linux x64 y verificar los doce hashes. El grupo de concurrencia
`codewolf-release` impide que dos publicaciones calculen simultáneamente la
misma versión.

## Estrategia de compilación

Un solo runner `ubuntu-latest`:

1. Instala Bun y dependencias una vez.
2. Genera agentes y compila el SDK durante el primer target.
3. Reutiliza esas salidas para los once targets restantes.
4. Descarga automáticamente el paquete nativo de OpenTUI requerido por cada
   combinación de sistema y arquitectura.
5. Realiza cross-compilation con los targets oficiales de Bun.
6. Publica artefactos temporales y una GitHub Release marcada como `latest`.

Los binarios macOS se publican sin firma. Gatekeeper puede requerir autorización
manual o firma/notarización en una fase futura.

## Variables internas de build

El script `cli/scripts/build-binary.ts` acepta:

```text
OVERRIDE_TARGET
OVERRIDE_PLATFORM
OVERRIDE_ARCH
CODEWOLF_SKIP_PREBUILD_AGENTS=true
CODEWOLF_SKIP_SDK_BUILD=true
```

No son necesarias para una compilación local normal; el workflow las usa para
cross-compilation y reutilización de trabajo.
