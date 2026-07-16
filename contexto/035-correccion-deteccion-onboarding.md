# 035 — Corrección de detección del onboarding inicial

# Fecha

2026-07-15

# Objetivo

Corregir el caso en que una instalación nueva omitía el onboarding aunque se
hubiera eliminado `~/.codewolf`, y agregar una forma explícita de volver a
abrirlo sin borrar la configuración.

# Archivos importantes modificados

- `cli/src/index.tsx`
- `cli/src/app.tsx`
- `cli/src/cli-args.ts`
- `cli/src/__tests__/cli-args.test.ts`
- `README.md`
- `AGENTS.md`
- `contexto/000-contexto-maestro.md`

# Soluciones implementadas

- La decisión de mostrar el onboarding se calcula antes de `initializeApp()` y
  antes de guardar el proyecto actual en `recent-projects.json`.
- `App` recibe la decisión inicial ya calculada y no vuelve a inspeccionar el
  disco después de que el propio arranque creó archivos.
- Se agregó `codewolf --onboarding` para volver a abrir la configuración inicial
  sin eliminar credenciales, proveedores, sesiones o historial.
- OpenCode Free continúa apareciendo siempre en `/models` como proveedor
  integrado y efímero; su presencia no significa que el onboarding haya sido
  completado ni que exista configuración previa.

# Problema encontrado

El flujo anterior ejecutaba este orden:

1. Crear `~/.codewolf`.
2. Guardar el proyecto actual en `recent-projects.json`.
3. Renderizar `App`.
4. Preguntar si existía estado previo.

Como `recent-projects.json` formaba parte de los indicadores de una instalación
anterior, el archivo creado durante ese mismo arranque hacía que una instalación
limpia se migrara silenciosamente y omitiera el onboarding.

# Decisiones tomadas

- Se conserva la detección de `recent-projects.json` para migrar instalaciones
  realmente antiguas; no se elimina ese indicador.
- La corrección se hace capturando el estado antes de los efectos secundarios de
  inicio, porque es más robusta que intentar distinguir después qué archivo fue
  creado por la ejecución actual.
- `--onboarding` fuerza solo la pantalla inicial; no borra ni reinicia datos.

# Validaciones

- Transpilación sintáctica correcta de `app.tsx`, `index.tsx`, `cli-args.ts` y la
  prueba de argumentos mediante TypeScript 5.8.3.
- Prueba agregada para confirmar que `--onboarding` se interpreta como una
  solicitud explícita y no como prompt.
- No se ejecutó la suite Bun completa porque el entorno de entrega no contiene
  Bun ni `node_modules`.

# Pruebas manuales requeridas

1. Ejecutar `codewolf --onboarding` sobre una instalación existente y comprobar
   que aparece la pantalla sin perder datos.
2. Renombrar temporalmente `~/.codewolf`, iniciar Codewolf desde una carpeta de
   proyecto y confirmar que el onboarding aparece antes del chat.
3. Completar la opción OpenCode Free, reiniciar y comprobar que el onboarding ya
   no se repite.
4. Abrir `/models` y confirmar que OpenCode Free sigue disponible.
