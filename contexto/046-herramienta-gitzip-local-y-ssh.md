# 046 — Herramienta GitZip local y SSH

# Fecha

2026-07-17

# Objetivo

Integrar una herramienta interna profesional para comprimir proyectos y
prepararlos para despliegue respetando `.gitignore`, tanto localmente como en
servidores administrados mediante conexiones SSH persistentes.

# Archivos importantes modificados

- `common/src/tools/params/tool/gitzip.ts`
- `common/src/tools/constants.ts`
- `common/src/tools/list.ts`
- `common/src/util/tool-permission.ts`
- `common/src/util/protected-env.ts`
- `sdk/src/tools/gitzip.ts`
- `sdk/src/run.ts`
- `packages/agent-runtime/src/tools/handlers/tool/gitzip.ts`
- `agents/types/tools.ts`
- `common/src/templates/initial-agents-dir/types/tools.ts`
- `agents/base2/base2.ts`
- `agents/base2/base-deep.ts`
- `agents/general-agent/general-agent.ts`
- `docs/gitzip.md`

# Soluciones implementadas

- Se agregó `gitzip` con `create`, `upload`, `remote_create` y
  `remote_extract`.
- El escáner local y remoto respeta reglas raíz y anidadas de `.gitignore`,
  además de los archivos de exclusión propios de Codewolf.
- Se excluyen `.git/`, el archivo de salida, temporales y `.env` protegidos por
  defecto.
- Los ZIP locales se generan con `adm-zip`; TAR y TAR.GZ se escriben mediante
  Node/Bun sin depender del ejecutable `tar` local.
- En remoto se construye un manifiesto explícito por SFTP y se entrega a
  `tar`/`zip`, evitando comprimir recursivamente rutas ignoradas.
- `upload` integra creación local, SFTP, extracción opcional y limpieza
  controlada.
- Safe Mode local, Safe Mode SSH y autorización independiente de `.env` se
  aplican según la acción.
- PLAN continúa sin acceso a la herramienta.
- Se añadió una lista conservadora para argumentos avanzados remotos que no
  permite sustituir el manifiesto ni activar ejecución indirecta.

# Librerías usadas

- `ignore` para semántica de patrones Git.
- `adm-zip` como dependencia de runtime del SDK para ZIP portable.
- `node:zlib` y streams estándar para TAR.GZ.

# Validación

- Typecheck aprobado en `agents`, `common`, `packages/agent-runtime`, `sdk` y
  `cli`.
- 32 pruebas enfocadas aprobadas, con 136 verificaciones.
- Compilación completa del SDK aprobada.
- Compilación del binario Bun para Linux x64 aprobada y smoke test `--version` correcto.
- Se probaron exclusiones raíz/anidadas, `.env`, carpetas vacías, ZIP, TAR.GZ,
  permisos y manifiesto remoto.

# Decisiones tomadas

- La herramienta usa una conexión SSH ya abierta; no duplica la gestión de
  perfiles ni credenciales de `ssh_remote`.
- Los archivos protegidos `.env` quedan fuera incluso si no aparecen en
  `.gitignore`, salvo solicitud y autorización explícitas.
- La implementación local no depende de binarios del sistema para conservar la
  compatibilidad del compilado Bun en Windows, Linux y macOS.

# Riesgos y límites

- `remote_create` y `remote_extract` requieren que el servidor disponga de
  `tar`, `zip` o `unzip` según el formato solicitado.
- Las pruebas remotas automatizadas usan un gestor SSH simulado; debe hacerse
  una prueba integral contra un servidor real antes de producción.
