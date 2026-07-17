# 030 — Estabilizar la suite local en Windows

# Fecha

2026-07-15

# Objetivo

Corregir los fallos restantes de `bun test` en Windows sin eliminar pruebas útiles ni reintroducir dependencias del backend retirado.

# Decisiones tomadas

- Las pruebas deben ejecutar el mismo binario de Bun que inició la suite mediante `process.execPath`, en lugar de depender de que `bun` esté disponible en `PATH`.
- Los textos visibles en español se consideran el contrato actual de la interfaz; las pruebas antiguas en inglés se actualizan.
- Las rutas de filesystems virtuales conservan su sintaxis POSIX o Win32 durante descubrimiento, lectura y autocompletado.
- Las escrituras atómicas asíncronas al mismo archivo se serializan por destino para evitar carreras de `rename` en Windows.
- La configuración local de pruebas usa valores seguros propios y no intenta cargar el paquete retirado `packages/internal` ni secretos de Infisical.
- Las integraciones y runners manuales se excluyen por rutas de directorio explícitas; las E2E de agentes continúan visibles como omitidas cuando no hay credenciales.

# Archivos importantes modificados

- `sdk/src/run-state.ts`
- `cli/src/hooks/use-path-tab-completion.ts`
- `cli/src/init/init-direnv.ts`
- `cli/src/utils/chat-transfer.ts`
- `cli/src/utils/write-file-atomic.ts`
- `cli/src/__tests__/test-utils.ts`
- `bunfig.toml`
- pruebas relacionadas con comandos, traducciones, rutas, direnv, commits y Zod
- `scripts/cleanup-codewolf-obsolete.ps1`

# Problemas encontrados

- El descubrimiento inicial componía rutas POSIX mediante `node:path` nativo y no leía los archivos esperados en Windows.
- La prueba de `/new` lanzaba el texto `bun` y fallaba cuando el ejecutable no estaba en el `PATH` heredado.
- Varias expectativas seguían ligadas a créditos comerciales, textos en inglés o comandos OAuth desactualizados.
- `direnv` estaba deshabilitado por plataforma y sus pruebas no podían simularlo correctamente en Windows.
- La importación portable marcaba como interrumpidos mensajes que solo carecían del campo histórico `isComplete`.
- Varias escrituras simultáneas podían competir al reemplazar el mismo archivo en Windows.
- Una prueba obsoleta del antiguo facade de búsqueda web seguía presente.

# Soluciones implementadas

- Se sustituyeron `path.join` y `path.dirname` por utilidades que respetan la sintaxis de la raíz inyectada.
- `/new` usa `process.execPath` en su proceso secundario de prueba.
- Se actualizaron las expectativas de `/connect`, textos de copia, mensajes de login y ausencia de créditos.
- El autocompletado exporta y prueba una conversión relativa portable.
- `direnv` se detecta mediante `direnv version`, sus llamadas son espiables y los enlaces de prueba usan junctions en Windows.
- La exportación/importación conserva los mensajes portables sin añadir avisos de interrupción artificiales.
- `writeFileAtomicAsync` mantiene una cola por archivo y garantiza que la última invocación sea el estado final.
- El entorno de pruebas del CLI se construye localmente con valores seguros.
- Se retiró la prueba obsoleta del facade de búsqueda y se añadió al script de limpieza.

# Pendientes

- Ejecutar `bun test` nuevamente en Windows con Bun 1.3.14 para confirmar el resultado completo.
- Mantener las 24 E2E sin credenciales como omitidas; no representan fallos locales.

# Próximos pasos

- Validar `bun install --frozen-lockfile`, los tres typechecks, `bun test`, `build:sdk` y `build:binary` antes del siguiente commit.
