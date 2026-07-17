# 025 — Acumulación de commits y contexto garantizado

# Fecha

2026-07-15

# Objetivo

Corregir el flujo de commits verificados para que los cambios omitidos mediante **No crear commit** se acumulen en una confirmación posterior, y garantizar que la integración opcional de `contexto/` documente realmente las implementaciones importantes. También ampliar `/init` para crear o actualizar la memoria persistente del proyecto activo.

# Decisiones tomadas

- Los cambios verificados no confirmados se conservan en un backlog persistente por proyecto fuera del repositorio.
- Un archivo pendiente solo puede acumularse mientras su huella SHA-256 coincida con el estado que Codewolf dejó al finalizar la implementación.
- Los cambios manuales posteriores se excluyen en lugar de incorporarse silenciosamente.
- El backlog se elimina únicamente después de crear correctamente el commit o cuando Git demuestra que ya no existen cambios pendientes seguros.
- Con contexto persistente activo, todo turno exitoso con mutaciones reales garantiza un registro numerado y la actualización del contexto maestro.
- La documentación automática usa un agente de salida estructurada y un fallback determinista local cuando el proveedor no responde.
- `/init` crea el contexto maestro si falta y fuerza un registro numerado de inicialización o actualización.
- Las escrituras automáticas de contexto participan en checkpoints de `/rewind` y en el conjunto de archivos elegibles para commits verificados.

# Arquitectura actual

- `cli/src/utils/verified-commit.ts` guarda `verified-commit-backlog.json` dentro de los datos locales del proyecto, reconcilia Git y huellas, acumula solicitudes y limpia el backlog tras un commit exitoso.
- `cli/src/hooks/use-send-message.ts` carga el backlog antes del turno, permite únicamente rutas diferidas seguras, une archivos anteriores y actuales, y guarda el conjunto combinado antes de mostrar la verificación.
- `cli/src/utils/project-context-maintenance.ts` genera registros de contexto, actualiza una sección delimitada del maestro, analiza inventario/manifiestos y protege el contenido con fallback local.
- `cli/src/commands/init.ts` informa que `/init` mantendrá `contexto/` cuando la opción está activa.
- El flujo detecta mutaciones estructuradas en proyectos sin Git y también cambios nuevos del árbol de trabajo en repositorios Git.

# Librerías usadas

- APIs estándar de Node.js: `fs`, `path`, `crypto` y `child_process` ya presentes.
- SDK existente de Codewolf para el agente documental estructurado.
- Git instalado en el sistema.
- No se agregaron dependencias.

# Archivos importantes modificados

- `cli/src/utils/verified-commit.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/components/verified-commit-screen.tsx`
- `cli/src/utils/project-context-maintenance.ts`
- `cli/src/commands/init.ts`
- `cli/src/utils/development-methodology.ts`
- `cli/src/utils/__tests__/verified-commit.test.ts`
- `cli/src/utils/__tests__/project-context-maintenance.test.ts`
- `README.md`
- `AGENTS.md`
- `docs/project-methodology.md`
- `docs/metodologia-desarrollo-universal.md`
- `contexto/000-contexto-maestro.md`

# Problemas encontrados

- Al seleccionar **No crear commit**, el siguiente turno trataba los archivos anteriores como cambios preexistentes y los excluía del commit posterior.
- No existía persistencia para distinguir cambios previos creados por Codewolf de modificaciones manuales ajenas.
- La actualización de `contexto/` dependía únicamente de que el agente principal obedeciera el prompt, por lo que podía finalizar cambios importantes sin documentarlos.
- `/init` solo creaba `knowledge.md` y `.agents/`; la integración de contexto no garantizaba la creación o actualización de `contexto/`.

# Soluciones implementadas

- Se agregó backlog persistente con solicitudes acumuladas, rutas y huellas por archivo.
- El selector permite rutas sucias únicamente cuando pertenecen al backlog y su huella sigue siendo segura.
- El commit final une archivos diferidos y actuales, vuelve a verificar cambios y limpia el backlog solo tras éxito.
- La interfaz explica que **No crear commit** acumula los cambios para la próxima confirmación.
- Se agregó mantenimiento automático de contexto después de turnos exitosos con cambios reales.
- El contexto maestro conserva contenido manual y solo reemplaza una sección automática delimitada.
- `/init` crea un maestro inicial antes de ejecutar y fuerza después un registro numerado de análisis/actualización.
- Se agregaron pruebas de selección diferida, creación automática de registros e inicialización de contexto.
- Se ejecutaron pruebas de integración reales con Git para confirmar que dos turnos separados terminan en un commit con ambos archivos.

# Pendientes

- Ejecutar la suite completa con Bun 1.3.14 y las dependencias instaladas.
- Probar el flujo interactivo empaquetado en Windows seleccionando varias veces **No crear commit** antes de confirmar.
- Revisar el costo del agente documental en proyectos con muchos turnos pequeños y ajustar el criterio de importancia solo si el uso real lo justifica.

# Próximos pasos

- Activar ambas opciones desde `/config` en un repositorio de prueba.
- Realizar dos cambios consecutivos, omitir el primer commit y confirmar el segundo.
- Verificar que el commit contiene ambos conjuntos y que `contexto/` incluye el registro más reciente.
- Ejecutar `/init` en un proyecto sin `contexto/` y luego en uno que ya lo tenga para confirmar creación y actualización.
