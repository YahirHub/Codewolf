# 053 — Instalación global por npm desde GitHub Releases

# Fecha

2026-07-18

# Objetivo

Permitir instalar Codewolf directamente desde el repositorio con
`npm i -g YahirHub/Codewolf` sin publicar un paquete en el registro npm y sin
compilar el monorepo en la máquina del usuario.

# Archivos importantes modificados

- `package.json`
- `bun.lock`
- `.gitignore`
- `npm/bin/codewolf.cjs`
- `npm/postinstall.cjs`
- `npm/lib/platform.cjs`
- `npm/lib/archive.cjs`
- `npm/lib/installer.cjs`
- `npm/__tests__/platform.test.cjs`
- `npm/__tests__/archive.test.cjs`
- `npm/__tests__/installer.test.cjs`
- `scripts/tmux/package.json`
- `scripts/test-all.go`
- `.github/workflows/build-binaries.yml`
- `.github/workflows/release-codewolf.yml`
- `scripts/cleanup-codewolf-obsolete.ps1`
- `README.md`
- `docs/install.md`
- `WINDOWS.md`
- `AGENTS.md`

# Soluciones implementadas

- El paquete raíz se llama `codewolf` y expone el bin global `codewolf` mediante
  un launcher Node pequeño.
- El `postinstall` solo descarga binarios automáticamente durante una instalación
  global realizada con npm. `bun install` y el desarrollo normal no descargan
  releases.
- El instalador detecta Windows, Linux o macOS; x64 o ARM64; glibc/musl en Linux;
  y AVX2 en x64 para seleccionar una variante baseline cuando sea necesario.
- La selección coincide exactamente con los assets de
  `.github/workflows/build-binaries.yml`, incluidas las variantes musl y
  baseline.
- Se descarga `SHA256SUMS.txt` desde la misma release y se verifica el SHA-256
  antes de extraer el archivo.
- La extracción ZIP/TAR.GZ está implementada con módulos estándar de Node para
  no depender de `tar`, `unzip` ni paquetes npm adicionales en el equipo del
  usuario.
- El extractor rechaza rutas absolutas y traversal con `..`.
- El runtime descargado conserva el ejecutable nativo y `tree-sitter.wasm`
  juntos dentro del paquete global; el launcher propaga argumentos, entorno,
  cwd y stdio.
- En x64 con AVX2, si una release omite por accidente el asset optimizado se
  permite usar la variante baseline porque sigue siendo compatible. Una CPU que
  requiere baseline nunca cae a una build AVX2.
- El paquete npm ligero conserva `LICENSE`, `NOTICE` y `README.md` junto con el launcher para mantener las atribuciones legales de la distribución.
- El paquete instalado desde GitHub contiene solo el launcher/instalador. Las
  dependencias `canvas` y `gif-encoder-2`, usadas únicamente por el visor tmux,
  se movieron a ese workspace para impedir que una instalación global intente
  instalar o compilar dependencias nativas del monorepo.
- `zod` dejó de declararse redundantemente en la raíz porque los workspaces que
  lo importan ya lo declaran directamente.

# Arquitectura actual

```text
npm i -g YahirHub/Codewolf
        │
        ▼
package GitHub ligero (~20 KB empaquetado)
        │
        ├── postinstall.cjs
        │      ├── detectar plataforma/arquitectura/libc/AVX2
        │      ├── descargar SHA256SUMS.txt
        │      ├── elegir asset compatible
        │      ├── descargar y verificar SHA-256
        │      └── extraer npm/runtime/{codewolf,tree-sitter.wasm}
        │
        └── bin/codewolf.cjs
               └── ejecutar el binario nativo
```

# Decisiones tomadas

- Se usa siempre `releases/latest/download` por defecto para que el repositorio
  GitHub actúe como instalador de la última release publicada.
- `CODEWOLF_RELEASE` permite fijar una etiqueta concreta sin cambiar el código.
- `CODEWOLF_REPOSITORY` permite probar forks manteniendo el mismo protocolo de
  assets.
- `npm rebuild -g codewolf` vuelve a ejecutar el `postinstall` y funciona como actualización explícita del runtime a la release `latest`.
- La detección AVX2 que no pueda confirmarse elige baseline por seguridad.
- No se usa la API de GitHub para descubrir assets: `SHA256SUMS.txt` es a la vez
  manifiesto de integridad y lista autoritativa de archivos disponibles.
- La instalación npm no realiza respaldos de `~/.codewolf` porque reemplaza el
  runtime dentro del paquete npm y no modifica la configuración portable del
  usuario.

# Validación realizada

- 21 pruebas Node aprobadas para selección de plataforma, musl/baseline,
  manifiestos SHA-256, fallback seguro, extracción ZIP/TAR.GZ, protección contra
  path traversal e instalación completa mediante un servidor HTTP local.
- `npm pack --dry-run` confirmó un paquete de aproximadamente 20 KB con solo 9
  archivos y sin dependencias del monorepo.
- Una instalación global desde el tarball generado creó correctamente el enlace
  global `codewolf` y no instaló dependencias adicionales.
- El launcher global fue probado contra un binario simulado y conservó los
  argumentos recibidos.
- Se verificó que npm establece `npm_config_global=true` durante el lifecycle de
  una instalación `-g`, que es la condición usada por el `postinstall`.
- La suite global `bun run tests` ejecuta también `bun run test:npm-installer` para evitar regresiones del instalador GitHub.
- Ambos workflows de release ejecutan las pruebas Node del instalador y `npm pack --dry-run` antes de compilar/publicar.
- Se comprobó que `npm rebuild -g codewolf` vuelve a ejecutar correctamente el `postinstall` del paquete global.

# Riesgos

- `npm i -g YahirHub/Codewolf` requiere Git porque npm obtiene el paquete desde
  un repositorio GitHub; después requiere acceso HTTPS a GitHub Releases.
- El workflow que publique la release marcada como `latest` debe conservar
  `SHA256SUMS.txt` y los nombres deterministas de assets. Una plataforma cuyo
  asset obligatorio no exista falla de forma explícita en lugar de instalar una
  build incompatible.
- La versión `1.0.0` del `package.json` raíz no controla qué binario se instala;
  por defecto el runtime proviene de la release `latest`. Para fijar una release
  se usa `CODEWOLF_RELEASE`.

# Próximos pasos

- Después de subir estos cambios a GitHub, probar en Windows con
  `npm uninstall -g codewolf` seguido de `npm i -g YahirHub/Codewolf` y ejecutar
  `codewolf --version`.
- Probar también una instalación Linux musl y macOS cuando haya entornos
  disponibles.
