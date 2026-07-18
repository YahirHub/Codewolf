# Instalar y actualizar Codewolf

## Instalación rápida

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
