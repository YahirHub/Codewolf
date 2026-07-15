# 023 — Metodología opcional, contexto persistente y commits verificados

# Fecha

2026-07-15

# Objetivo

Integrar en el CLI una metodología profesional opcional que recupere la memoria técnica de `contexto/`, obligue a investigar cuando exista incertidumbre y permita crear commits automáticos únicamente después de que el usuario confirme que la implementación funciona.

# Decisiones tomadas

- Las funciones se controlan por separado desde `/config` y están desactivadas por defecto para no cambiar el comportamiento de instalaciones existentes.
- La integración de `contexto/` usa un agente de solo lectura y salida estructurada.
- El resumen se cachea por huella SHA-256 de los documentos para evitar llamadas repetidas al modelo.
- La lectura automática se limita a 200 archivos y 320 000 bytes; conserva el contexto maestro y prioriza los documentos más recientes cuando se supera el límite.
- El siguiente prefijo se calcula sobre todos los nombres existentes, aunque algunos documentos no entren en el resumen automático, para impedir colisiones.
- La metodología y el resumen se inyectan como archivos virtuales de conocimiento; no se crean archivos `.codewolf` dentro del repositorio.
- Si `contexto/` no existe, el agente puede crear `000-contexto-maestro.md` y el siguiente documento numerado después de un cambio importante.
- Los commits verificados observan únicamente mutaciones realizadas mediante `write_file`, `str_replace` y `apply_patch`.
- Los archivos ya modificados antes del turno se excluyen para no mezclar trabajo previo del usuario.
- El CLI nunca crea el commit hasta recibir una confirmación explícita en la pantalla de verificación.
- Si existen cambios preparados previamente, archivos modificados después de la ejecución o un repositorio distinto, el commit se rechaza de forma segura.
- El agente principal recibe una regla explícita para usar herramientas de búsqueda y agentes de documentación cuando dude o necesite información actualizada, especialmente al estructurar proyectos.

# Arquitectura actual

- `cli/src/components/config-screen.tsx` administra las dos opciones globales.
- `cli/src/utils/project-context.ts` descubre, ordena, resume y cachea `contexto/*.md`.
- `cli/src/utils/development-methodology.ts` contiene las reglas virtuales inyectadas al agente.
- `sdk/src/run.ts` permite añadir archivos de conocimiento adicionales y retirar rutas virtuales deshabilitadas sin reemplazar los documentos detectados normalmente.
- `cli/src/hooks/use-send-message.ts` prepara el contexto antes de cada ejecución, registra las mutaciones y genera una solicitud de verificación al terminar.
- `cli/src/components/verified-commit-screen.tsx` solicita probar, corregir u omitir el commit.
- `cli/src/utils/verified-commit.ts` limita rutas, comprueba Git, genera el mensaje y crea el commit.

# Librerías usadas

- APIs estándar de Node.js: `fs`, `path`, `crypto`, `child_process` y `util`.
- SDK existente de Codewolf para los agentes de resumen y redacción del commit.
- OpenTUI/React existentes para `/config` y la verificación.
- Git instalado en el sistema; no se agregó ninguna dependencia.

# Archivos importantes modificados

- `agents/base2/base2.ts`
- `cli/src/chat.tsx`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/utils/settings.ts`
- `cli/src/utils/create-run-config.ts`
- `sdk/src/client.ts`
- `sdk/src/run.ts`
- `README.md`
- `AGENTS.md`

# Problemas encontrados

- No existía `/config` ni una interfaz central para estas opciones.
- Leer toda la carpeta en cada turno consumiría contexto y llamadas innecesarias; enviar una carpeta muy grande en una sola petición también podía desbordar modelos con ventanas menores.
- Un commit automático ingenuo podía mezclar cambios previos, archivos preparados o trabajo manual posterior.
- La cola de mensajes podía comenzar otra solicitud antes de que el usuario verificara la implementación.
- Los prompts existentes exigían revisar librerías locales, pero no ordenaban de forma general investigar cuando faltaba conocimiento actual.

# Soluciones implementadas

- Se agregó `/config` con dos interruptores persistentes e independientes.
- Se implementó descubrimiento numérico, límite de 200 archivos/320 000 bytes, prioridad para `000-contexto-maestro.md` y documentos recientes, resumen estructurado y caché por huella.
- Se inyectan metodología y resumen mediante `additionalKnowledgeFiles` en el SDK.
- La verificación pausa la cola hasta confirmar, corregir u omitir.
- El commit se limita a archivos estructuralmente editados, limpios al comenzar el turno y que todavía presentan un cambio real al terminar; las rutas revertidas o sin diff se descartan.
- Antes de preparar Git se repiten las huellas y la comprobación de staging, y después se valida que el conjunto preparado coincida exactamente con el conjunto confirmado.
- Se generan `Summary` y `Description` en español y se filtran referencias prohibidas.
- Se agregaron pruebas enfocadas para orden y límites de contexto, selección segura de archivos, conocimiento virtual en sesiones continuadas y comando `/config`.
- La validación enfocada final ejecutó 135 pruebas sin fallos, además de una prueba Git real y una prueba de regeneración/caché del resumen con un cliente simulado.
- Se documentó el flujo completo y se incluyó la metodología fuente en `docs/`.

# Pendientes

- Ejecutar la suite completa con Bun 1.3.14 y dependencias instaladas.
- Probar el flujo interactivo en Windows y Linux con repositorios limpios, sucios y con cambios preparados.
- Evaluar en el futuro una configuración por proyecto además de la configuración global, solo si existe una necesidad real.

# Próximos pasos

- Activar ambas funciones desde `/config` en un repositorio de prueba.
- Confirmar que el resumen se reutiliza mientras `contexto/` no cambia y se regenera después de editarlo.
- Implementar una modificación pequeña, probarla y confirmar que el commit contiene únicamente los archivos esperados.
