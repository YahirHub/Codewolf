# 022 — Modo PLAN seguro y restauración `/rewind`

Fecha: 2026-07-15

## Objetivo

Convertir el modo PLAN existente en una etapa de investigación y diseño realmente
segura, sin mantener un comando `/plan` redundante, e incorporar `/rewind` para
volver al estado anterior a una solicitud recuperando la conversación, los
archivos editados por Codewolf o ambos.

## Contexto recuperado

- El modo PLAN ya se seleccionaba desde el control de modos junto a DEFAULT,
  MAX y LITE y utilizaba `base2-plan`.
- Existía además un comando `/plan` que solo transformaba el texto en un prompt;
  duplicaba la entrada visual y no garantizaba que el agente permaneciera en
  solo lectura.
- Los planes se representan mediante bloques `<PLAN>...</PLAN>` y muestran
  botones para implementar con modo predeterminado, máximo o ligero.
- Las sesiones persisten `chat-messages.json`, `run-state.json` y
  `chat-meta.json`, pero no conservaban puntos anteriores ni copias de los
  archivos modificados por las herramientas del SDK.
- El SDK centraliza `write_file`, `str_replace` y `apply_patch`, incluidos los
  llamados realizados por subagentes, por lo que es el punto correcto para
  observar mutaciones de archivos.

## Investigación de referencia

El comportamiento de checkpointing tomado como referencia crea un punto antes
de cada solicitud, permite elegir un mensaje anterior y ofrece restaurar código
y conversación, solo conversación o solo código. Los puntos se conservan con
la sesión y el sistema no pretende reemplazar Git. Los cambios producidos por
comandos de terminal o procesos externos quedan fuera del rastreo de archivos.

## Decisiones

### Modo PLAN

- Eliminar `/plan` del registro, menú de comandos, router y modos de entrada.
- Mantener PLAN únicamente en el selector de modos y en `mode:plan` como
  mecanismo técnico del selector existente.
- Aplicar solo lectura por capacidades, no únicamente por instrucciones:
  - sin `write_file`, `str_replace`, propuestas de cambios ni `write_todos`;
  - sin agentes editores, bashers, tmux ni agente genérico;
  - con lectura, búsqueda, skills, preguntas y agentes de investigación.
- Exigir que el plan se base en archivos reales, contexto persistente,
  dependencias, pruebas, contratos, permisos y riesgos.
- Estructurar la salida con objetivo, contexto verificado, decisiones,
  implementación numerada, archivos, validación, riesgos/reversión y una lista
  inicial que pueda convertirse en `write_todos` al aprobarse.
- Los botones de implementación envían una aprobación explícita y obligan al
  agente ejecutor a convertir el plan en tareas visibles antes de editar.
- Agregar **Revisar o ajustar plan**, que conserva PLAN y prepara una solicitud
  de revisión usando el plan anterior del historial.

### `/rewind`

- Crear un checkpoint justo antes de cada solicitud que sí se envía al agente.
- Conservar un máximo de 100 puntos por conversación.
- Guardar checkpoints dentro del directorio del chat y junto con este, para que
  `/history`, exportaciones de carpeta o copias de datos no mezclen proyectos.
- Utilizar almacenamiento dirigido por contenido:
  - mensajes UI individuales en `objects/<sha>.json`;
  - mensajes internos del agente en objetos deduplicados;
  - contenido de archivos en `files/<sha>.bin`;
  - `index.json` como línea temporal y manifiesto.
- Registrar archivos antes y después de `write_file`, `str_replace` y
  `apply_patch` mediante callbacks del SDK.
- Los callbacks son observabilidad best-effort: una falla del checkpoint nunca
  debe impedir ni convertir en error una edición válida.
- `/rewind` detiene primero la ejecución activa para congelar conversación y
  archivos antes de mostrar la selección.
- Acciones disponibles:
  1. restaurar conversación y archivos;
  2. restaurar solo conversación;
  3. restaurar solo archivos.
- Al restaurar conversación, devolver la solicitud original al campo de entrada
  para poder modificarla y reenviarla.
- Al restaurar conversación o ambos, truncar la línea temporal posterior al
  punto elegido.
- Antes de guardar el estado restaurado, drenar checkpoints asíncronos del turno
  abortado para impedir que una escritura antigua resucite la conversación
  descartada.
- Sincronizar de forma inmediata el `RunState` visible y la referencia usada por
  el siguiente envío; no depender de un efecto React que podría ejecutarse
  después de que el usuario pulse Enter.

## Protección de archivos

- Solo se restauran archivos modificados por herramientas estructuradas de
  Codewolf.
- No se intentan revertir comandos Bash, scripts, Git, editores externos, MCP ni
  procesos de terceros.
- Antes de sobrescribir, el contenido actual se compara con el último estado
  conocido después de la edición de Codewolf. Si cambió externamente, el
  archivo se omite y se informa al usuario.
- Se rechazan rutas fuera del proyecto y escapes mediante enlaces simbólicos.
- Los archivos nuevos se eliminan al volver a un punto donde no existían; los
  archivos borrados mediante `apply_patch` se recrean cuando hay una copia.
- Los permisos básicos del archivo se conservan cuando el sistema de archivos
  lo permite.
- Las restauraciones escriben blobs mediante reemplazo atómico.
- La cola por conversación entrega los errores al llamador, pero mantiene una
  cola interna sin rechazos pendientes para que una ruta inválida no provoque
  después un cierre global no controlado.

## Arquitectura

```text
Antes de cada prompt
  use-send-message
      └── createRewindCheckpoint(chat, mensajes, RunState)

Mutación de archivo
  SDK handleToolCall
      ├── onBeforeFileMutation → snapshot previo
      ├── write_file / str_replace / apply_patch
      └── onAfterFileMutation  → último estado conocido

/rewind
  command-registry
      ├── aborta ejecución
      └── abre RewindScreen
            ├── punto anterior
            ├── conversación + archivos
            ├── solo conversación
            └── solo archivos

Restauración
  restoreRewindCheckpoint
      ├── valida conflictos y rutas
      ├── restaura archivos elegibles
      ├── reconstruye mensajes y RunState
      └── recorta checkpoints futuros cuando vuelve el chat
```

## Archivos principales

- `agents/base2/base2.ts`
- `agents/__tests__/base2.test.ts`
- `cli/src/components/build-mode-buttons.tsx`
- `cli/src/components/rewind-screen.tsx`
- `cli/src/hooks/use-chat-input.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/chat.tsx`
- `cli/src/commands/command-registry.ts`
- `cli/src/commands/router.ts`
- `cli/src/commands/prompt-builders.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/utils/input-modes.ts`
- `cli/src/utils/rewind-checkpoints.ts`
- `cli/src/utils/run-state-storage.ts`
- `cli/src/utils/create-run-config.ts`
- `sdk/src/run.ts`
- `sdk/src/index.ts`

## Validación requerida

### PLAN

- Seleccionar PLAN desde el control visual y confirmar que investiga antes de
  responder.
- Verificar que el agente no tenga herramientas de escritura, terminal ni
  agentes editores.
- Confirmar que el resultado incluya pasos, archivos, pruebas y reversión.
- Pulsar **Revisar o ajustar plan** y comprobar que permanece en PLAN.
- Aprobar con DEFAULT, MAX y LITE y verificar que se crea `write_todos` antes de
  las ediciones.
- Confirmar que `/plan` ya no aparece ni se reconoce como comando.

### Rewind

- Enviar varias solicitudes que editen, creen y eliminen archivos.
- Ejecutar `/rewind`, elegir un punto y probar las tres acciones.
- Confirmar que la solicitud seleccionada vuelve al input en las acciones que
  restauran conversación.
- Modificar manualmente un archivo después de una edición del agente y verificar
  que `/rewind` lo omite en lugar de sobrescribirlo.
- Probar un chat recién creado, un chat reanudado desde `/history`, una sesión
  compactada y una ejecución interrumpida.
- Confirmar que al superar 100 solicitudes solo se conservan las 100 más
  recientes.

## Limitaciones explícitas

- `/rewind` no sustituye Git ni es un respaldo completo del proyecto.
- Las mutaciones ejecutadas mediante Bash, scripts, herramientas MCP, editores
  externos o procesos de desarrollo no pueden reconstruirse automáticamente.
- Una conversación restaurada puede referirse a cambios externos que no fueron
  restaurados; los archivos omitidos por conflicto deben revisarse manualmente.
- Los puntos anteriores a instalar esta versión no existen retroactivamente.

## Validación ejecutada en el entorno de entrega

- Transpilación sintáctica de los archivos TypeScript/TSX modificados.
- Prueba real independiente de restauración de conversación y archivos.
- Prueba de creación y posterior eliminación de archivos nuevos.
- Prueba de restauración separada de conversación y archivos.
- Prueba de protección ante cambios manuales posteriores.
- Prueba de rechazo de rutas `..` y escapes mediante enlaces simbólicos.
- Prueba de recuperación de la cola después de una operación rechazada.
- Prueba de retención de los 100 checkpoints más recientes.
- Validación estática de que `/plan` no está registrado y de que PLAN no expone
  herramientas ni agentes de mutación.

La suite Bun completa no pudo ejecutarse en el entorno de entrega porque no
estaban instalados Bun ni `node_modules` y la descarga estaba bloqueada por DNS.

## Pendientes

- Evaluar una vista futura para comparar el diff de archivos antes de confirmar
  la restauración.
- Evaluar checkpoints opcionales para comandos de terminal cuando se pueda
  determinar de forma confiable qué archivos modificaron.
- Considerar exportar los checkpoints dentro del formato portable JSONL en una
  versión nueva y compatible del archivo de transferencia.
