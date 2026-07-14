# 012 - Renombrado de Codewolf y compilación multiplataforma

## Objetivo

Eliminar la marca visible Codebuff del editor y distribuir binarios llamados Codewolf para Windows y Linux.

## Cambios

- El logo principal, el título de terminal, la ayuda y los textos visibles muestran `CODEWOLF`/`Codewolf`.
- El comando y el binario principal se llaman `codewolf` (`codewolf.exe` en Windows).
- Los prompts base identifican el producto como Codewolf y ya no remiten al sitio ni al sistema de créditos del proyecto original.
- La configuración interna heredada `CODEBUFF_*` se conserva únicamente como compatibilidad para evitar romper el runtime; los nuevos metadatos `CODEWOLF_*` se incluyen en el binario.
- `bun run build:binary` genera `cli/bin/codewolf` o `cli/bin/codewolf.exe` junto con `tree-sitter.wasm`.

## Estado histórico y vigencia

Este documento describe la primera versión del workflow y se conserva como
historial técnico. La política de ejecución y versionado de esta sección fue
reemplazada por `013-releases-automaticas-dialogos-espanol.md` y
`014-contexto-persistente-workflow-edicion-comunitaria.md`.

## GitHub Actions (implementación histórica)

La primera implementación permitía ejecución manual o mediante una etiqueta
`v*`. Este comportamiento ya no está vigente: el workflow actual se ejecuta
exclusivamente mediante `workflow_dispatch` y crea etiquetas numéricas sin
prefijo.

Para reducir minutos:

- Usa un único runner Linux.
- Compila Linux de forma nativa y Windows mediante cross-compilation de Bun.
- Instala dependencias una sola vez.
- Genera agentes y SDK una sola vez; la segunda compilación reutiliza ambos resultados.
- Usa caché de descargas de Bun, checkout superficial, concurrencia cancelable y retención de artefactos de siete días.
- Empaqueta Linux en TAR para conservar permisos, Windows en ZIP sin compresión y sube ambos en un solo artefacto sin recomprimirlos.

## Salidas

- `dist/codewolf-linux-x64.tar` (conserva el permiso ejecutable)
- `dist/codewolf-windows-x64.zip`
- `dist/SHA256SUMS.txt`

## Documentación

- `docs/build-binaries.md` explica la compilación local, los disparadores del workflow y la descarga de artefactos.
