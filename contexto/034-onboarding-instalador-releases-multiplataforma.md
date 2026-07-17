# 034 — Onboarding, instalador y releases multiplataforma

# Fecha

2026-07-15

# Objetivo

Agregar una configuración inicial para instalaciones nuevas, documentar
correctamente la procedencia Apache-2.0 del proyecto, crear un instalador que
también actualice con respaldo y ampliar las releases a Linux, macOS y Windows
en más arquitecturas.

# Archivos importantes modificados

- `cli/src/components/first-run-onboarding-screen.tsx`
- `cli/src/components/provider-auth-flow-screen.tsx`
- `cli/src/utils/first-run-onboarding.ts`
- `cli/src/utils/settings.ts`
- `cli/src/app.tsx`
- `cli/scripts/build-binary.ts`
- `.github/workflows/build-binaries.yml`
- `install.sh`
- `docs/install.md`
- `docs/build-binaries.md`
- `README.md`
- `NOTICE`
- `AGENTS.md`

# Soluciones implementadas

- Una instalación realmente nueva muestra un onboarding antes del selector de
  proyecto y explica que Codewolf fue creado y es mantenido por YahirHub usando
  Codebuff como base.
- El onboarding conserva la atribución Apache-2.0 y permite iniciar con una
  suscripción, configurar un proveedor OpenAI-compatible o activar OpenCode
  Free sin API key.
- La finalización se registra mediante `onboardingVersion` en
  `~/.codewolf/settings.json`.
- Las instalaciones anteriores se detectan por proveedores, credenciales,
  búsqueda, historial, uso o sesiones existentes; se migran silenciosamente y
  no pierden su proveedor activo.
- `install.sh` selecciona la release `latest` según sistema, x64/ARM64, glibc o
  musl y disponibilidad de AVX2. Verifica SHA-256, instala el WASM junto al
  ejecutable y agrega `~/.local/bin` a Bash.
- Cuando encuentra una instalación anterior, respalda `~/.codewolf` en
  `~/.codewolf-backups` antes de actualizar.
- El workflow manual publica doce paquetes: Linux glibc/musl, macOS y Windows,
  incluyendo ARM64 y variantes x64 baseline.
- Cada paquete incluye `LICENSE`, `NOTICE` y `README.md`, además del ejecutable y
  `tree-sitter.wasm`.

# Decisiones tomadas

- El repositorio predeterminado del instalador es `YahirHub/codewolf`; puede
  sustituirse mediante `CODEWOLF_REPOSITORY` para forks o pruebas.
- Los usuarios existentes no deben recibir un onboarding retroactivo solo por
  actualizar, porque podrían tener automatizaciones y proveedores ya
  configurados.
- Se conserva un único runner Linux para reutilizar dependencias, agentes y SDK
  durante la cross-compilation de todos los targets.
- Las builds macOS se publican sin firma ni notarización; esa protección queda
  separada porque requiere certificados de Apple.

# Librerías usadas

No se agregaron dependencias. El onboarding reutiliza React/OpenTUI y los flujos
existentes de proveedores. El instalador usa herramientas estándar de shell,
GitHub Releases y sumas SHA-256.

# Problemas encontrados

- Los ZIP anteriores no incluían `.github/`, aunque la documentación histórica
  describía el workflow. Se reconstruyó `.github/workflows/build-binaries.yml`
  dentro de esta entrega.
- `tree-sitter.wasm` debe permanecer junto a `process.execPath`; por eso el
  instalador coloca ambos archivos en el mismo directorio.
- Las CPU x64 antiguas pueden fallar con instrucciones AVX2; se añadieron
  paquetes baseline y detección automática.

# Pendientes

- Ejecutar el workflow real en GitHub y comprobar cada paquete en hardware o
  runners nativos, especialmente Windows ARM64 y macOS.
- Firmar y notarizar binarios macOS si se dispone de una cuenta Apple Developer.

# Próximos pasos

Publicar el repositorio bajo `YahirHub/codewolf`, ejecutar manualmente el
workflow, instalar con `install.sh` en una máquina limpia y repetir la ejecución
para verificar respaldo y actualización.
