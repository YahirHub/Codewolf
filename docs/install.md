# Instalar y actualizar Codewolf

## Instalación rápida con npm desde GitHub

Con Node.js 18.18 o superior, npm y Git instalados:

```bash
npm i -g YahirHub/Codewolf
```

No es necesario publicar Codewolf en el registro npm. npm obtiene el paquete
directamente del repositorio de GitHub y registra el launcher global. La primera
vez que se ejecuta `codewolf`, ese launcher descarga el binario precompilado de
la release marcada como `latest`, verifica su integridad y lo inicia:

```bash
codewolf
```

El runtime nativo no se descarga mediante un lifecycle `postinstall`. Esto evita
fallos `ENOENT: uv_cwd` que pueden producirse cuando npm instala una dependencia
Git preparando el repositorio en directorios temporales. El ejecutable y
`tree-sitter.wasm` se descargan desde GitHub Releases al primer `codewolf` después
de verificar `SHA256SUMS.txt`.

Para forzar manualmente una nueva descarga desde un checkout del repositorio:

```bash
npm run download:npm-binary
```

Para actualizar una instalación global desde GitHub, reinstala el launcher y
ejecuta Codewolf; si el runtime fue reemplazado con el paquete, la primera ejecución
lo descargará de nuevo:

```bash
npm i -g YahirHub/Codewolf --force
codewolf --version
```

Para actualizar también el código del instalador/launcher desde la rama
predeterminada del repositorio se puede reinstalar explícitamente:

```bash
npm i -g YahirHub/Codewolf --force
```

También se puede fijar una release concreta para la descarga del binario:

```bash
CODEWOLF_RELEASE=1.0.9 npm i -g YahirHub/Codewolf
```

En PowerShell, fija la release antes de la primera ejecución posterior a la
instalación:

```powershell
$env:CODEWOLF_RELEASE = '1.0.9'
npm i -g YahirHub/Codewolf --force
codewolf --version
```

## Instalación con script shell

```bash
curl -fsSL https://raw.githubusercontent.com/YahirHub/codewolf/main/install.sh | sh
```

El script está pensado para Linux, macOS y terminales Bash compatibles en
Windows, como Git Bash, MSYS2 o Cygwin.

## Detección automática

`install.sh` detecta:

- Sistema operativo: Linux, macOS o Windows desde Bash.
- Arquitectura: x64 o ARM64.
- Linux con glibc o musl; Alpine selecciona automáticamente un paquete musl.
- Soporte AVX2 en x64. Si no está disponible, instala una build `baseline` para
  procesadores antiguos.

Se puede forzar la variante de CPU:

```bash
CODEWOLF_BASELINE=1 ./install.sh  # siempre baseline
CODEWOLF_BASELINE=0 ./install.sh  # siempre estándar/AVX2
```

## Archivos instalados

Por defecto:

```text
~/.local/bin/codewolf
~/.local/bin/tree-sitter.wasm
~/.local/share/codewolf/LICENSE
~/.local/share/codewolf/NOTICE
~/.local/share/codewolf/README.md
```

En Windows desde Git Bash, el ejecutable se guarda como
`~/.local/bin/codewolf.exe`.

El script añade un bloque identificado a `~/.bashrc`; si detecta Zsh también lo
añade a `~/.zshrc`. No duplica el bloque en ejecuciones posteriores.

## Actualización y respaldo

Cada ejecución descarga la release marcada como `latest`. Cuando detecta un
comando o archivo Codewolf ya instalado:

1. Crea un TAR comprimido de la configuración actual.
2. Descarga el paquete apropiado en un directorio temporal.
3. Descarga `SHA256SUMS.txt`.
4. Verifica el hash antes de extraer o reemplazar archivos.
5. Instala el binario y `tree-sitter.wasm` mediante reemplazos atómicos.

Los respaldos se guardan en:

```text
~/.codewolf-backups/codewolf-config-AAAAmmdd-HHMMSS.tar.gz
```

El respaldo incluye proveedores, credenciales, sesiones, historial, skills,
uso local y contexto persistente almacenado bajo `~/.codewolf`.

## Variables disponibles

```text
CODEWOLF_REPOSITORY   Repositorio de releases; predeterminado YahirHub/codewolf
CODEWOLF_BIN_DIR      Directorio del ejecutable; predeterminado ~/.local/bin
CODEWOLF_SHARE_DIR    Licencia y documentación; predeterminado ~/.local/share/codewolf
CODEWOLF_CONFIG_DIR   Configuración a respaldar; predeterminado ~/.codewolf
CODEWOLF_BACKUP_DIR   Destino de respaldos; predeterminado ~/.codewolf-backups
CODEWOLF_BASELINE     auto, 1 o 0
```

Ejemplo para probar una bifurcación antes de publicar en el repositorio
principal:

```bash
CODEWOLF_REPOSITORY=usuario/codewolf ./install.sh
```

## Requisitos del sistema

- `curl` o `wget`.
- `tar`.
- `sha256sum` o `shasum`.
- `unzip` o un `tar` capaz de abrir ZIP para instalar en Windows.

Codewolf no necesita Bun para ejecutarse desde una release compilada.


## Instalador npm desde GitHub

El paquete raíz declara:

```json
{
  "bin": {
    "codewolf": "./npm/bin/codewolf.cjs"
  },
  "scripts": {
    "download:npm-binary": "node ./npm/postinstall.cjs"
  }
}
```

Durante la primera ejecución del launcher global, el instalador:

1. Detecta `win32`, `linux` o `darwin` y x64/ARM64.
2. En Linux distingue glibc de musl.
3. En x64 detecta AVX2; si no puede confirmarlo utiliza la build `baseline`, que
   es la opción segura para procesadores antiguos.
4. Descarga `SHA256SUMS.txt` desde la misma release.
5. Selecciona únicamente un asset incluido en ese manifiesto.
6. Descarga y verifica SHA-256 antes de extraer.
7. Rechaza rutas absolutas o `..` al extraer ZIP/TAR.GZ.
8. Conserva `codewolf`/`codewolf.exe` y `tree-sitter.wasm` juntos dentro del
   runtime privado del paquete global.
9. El launcher global ejecuta el binario nativo conservando argumentos, entorno,
   directorio actual y entrada/salida de terminal.

Los nombres esperados coinciden con `.github/workflows/build-binaries.yml`:

```text
codewolf-darwin-arm64.tar.gz
codewolf-darwin-x64.tar.gz
codewolf-darwin-x64-baseline.tar.gz
codewolf-linux-arm64.tar.gz
codewolf-linux-arm64-musl.tar.gz
codewolf-linux-x64.tar.gz
codewolf-linux-x64-baseline.tar.gz
codewolf-linux-x64-musl.tar.gz
codewolf-linux-x64-musl-baseline.tar.gz
codewolf-windows-arm64.zip
codewolf-windows-x64.zip
codewolf-windows-x64-baseline.zip
SHA256SUMS.txt
```

Variables específicas del instalador npm:

```text
CODEWOLF_REPOSITORY          Repositorio de GitHub; predeterminado YahirHub/Codewolf
CODEWOLF_RELEASE             latest o una etiqueta concreta, por ejemplo 1.0.9
CODEWOLF_BASELINE            auto, 1 o 0
CODEWOLF_NPM_SKIP_DOWNLOAD   1 impide la descarga automática del runtime
```

`bun install` y `npm i -g` no descargan ninguna release mediante lifecycle scripts.
La descarga ocurre únicamente cuando el usuario ejecuta `codewolf` sin un runtime
válido o cuando un mantenedor ejecuta `npm run download:npm-binary` explícitamente.
