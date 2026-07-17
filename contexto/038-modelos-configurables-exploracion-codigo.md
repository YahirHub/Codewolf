# 038 — Modelos configurables para exploración de código

# Fecha

2026-07-16

# Objetivo

Permitir que los agentes de búsqueda y exploración del proyecto distribuyan carga entre modelos distintos sin perder la opción de heredar el modelo seleccionado en la sesión.

# Decisiones tomadas

- Exponer preferencias independientes para `code-searcher`, `file-picker` y `file-lister`.
- Aplicar la preferencia de `file-picker` también a `file-picker-max`.
- Aplicar la preferencia de `file-lister` también a `file-lister-max`.
- Una preferencia vacía significa heredar el modelo congelado de `/models` para la tarea actual.
- `Supr` elimina una asignación y restaura la herencia de sesión.
- La herencia de sesión se conserva en subagentes anidados; un `file-lister` sin asignación no hereda accidentalmente el modelo dedicado de su `file-picker` padre.

# Arquitectura actual

1. `/config` guarda referencias por `providerId` y `modelId` en `~/.codewolf/settings.json`.
2. El CLI resuelve las referencias contra el catálogo actual y entrega los overrides al SDK.
3. El runtime clasifica cada subagente por función y aplica la prioridad específica.
4. Cuando no existe override, utiliza el proveedor/modelo de sesión capturado al iniciar la tarea.

# Soluciones implementadas

- Se añadieron las opciones **Búsqueda de código**, **Selección de archivos** y **Listado de archivos** en la sección de modelos de agentes.
- Las opciones reutilizan el selector con buscador de `/models`.
- Se propagaron las asignaciones por los contratos `common`, SDK y runtime.
- Se añadió una referencia separada al modelo de sesión para mantener una herencia correcta entre agentes anidados.
- Se añadieron pruebas de persistencia, borrado, variantes `-max`, prioridad y restauración del modelo de sesión.

# Próximos pasos

- Ejecutar `bun run tests` y verificar visualmente las tres opciones desde `/config`.
- Probar una tarea que lance `file-picker-max`, `file-lister` y `code-searcher` con modelos diferentes.
