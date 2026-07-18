# 054 - Instalador npm desde GitHub sin postinstall

## Problema

La instalación global directa desde GitHub podía fallar en Linux con:

```text
Error: ENOENT: no such file or directory, uv_cwd
npm error command sh -c node ./npm/postinstall.cjs
```

npm prepara dependencias obtenidas desde Git cuando el paquete raíz contiene
`workspaces` o scripts lifecycle como `postinstall`. Esa preparación utiliza
directorios temporales que pueden ser movidos durante el proceso. El downloader
binario no debe depender de ese ciclo.

## Decisión

- El paquete raíz ya no registra `postinstall`, `install`, `preinstall`,
  `prepare` ni `prepack` para el instalador de Codewolf.
- `npm i -g YahirHub/Codewolf` instala el launcher global.
- La primera ejecución de `codewolf` llama `ensureInstalled()`.
- Si falta un runtime válido, el launcher descarga el asset correcto de GitHub
  Releases, valida SHA-256, extrae el binario y `tree-sitter.wasm` y después
  inicia el ejecutable nativo.
- Si el runtime ya existe y su `install.json.target` coincide con la plataforma
  detectada, no se realiza ninguna petición de red.
- `npm/postinstall.cjs` se conserva únicamente como helper manual mediante
  `npm run download:npm-binary`; no es un lifecycle script.

## Seguridad y compatibilidad

La descarga mantiene selección por SO, arquitectura, libc y baseline/AVX2,
verificación SHA-256 y extracción segura. `CODEWOLF_NPM_SKIP_DOWNLOAD=1` impide
la descarga automática. Un runtime de otro target se considera inválido y se
vuelve a descargar.

## Validación

- 25 pruebas Node del instalador aprobadas.
- El package.json no registra lifecycle scripts de instalación/preparación.
- `npm pack` genera el paquete global correctamente.
- Instalación global desde tarball probada.
- El launcher global queda enlazado y, con descarga deshabilitada, devuelve un
  error controlado en vez de ejecutar un postinstall.
