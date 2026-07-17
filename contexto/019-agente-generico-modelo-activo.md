# 019 — Agente genérico con el modelo activo

# Fecha

2026-07-14

# Objetivo

Reemplazar el atajo ligado a GPT-5 por un único comando `/agent` con identidad
neutral, haciendo que el agente auxiliar use exactamente el proveedor y modelo
ya seleccionados en la sesión/configuración del CLI mediante `/models`.

# Decisiones tomadas

- Exponer únicamente `/agent`; retirar `/agent:gpt-5` y `/gpt-5-agent`.
- Usar `Agent` como nombre visible y `agent` como ID estable de la plantilla.
- No crear un selector adicional ni una asignación persistente por agente.
- Heredar el `customProvider` global que el CLI ya propaga al agente principal y
  a todos los subagentes.
- Mantener un modelo interno de respaldo solo para el comportamiento heredado
  cuando no hay proveedor personalizado activo.
- No crear commit ni incluir `.git` en la entrega, porque el usuario administra
  su propio control de versiones.

# Arquitectura actual

1. `/models` guarda el proveedor/modelo activo y reinicia el cliente SDK en
   caché.
2. `/agent` inserta `@Agent ` en el campo de entrada sin guardar el comando en el
   historial.
3. La mención se resuelve contra la plantilla integrada con ID `agent` y nombre
   visible `Agent`.
4. El CLI entrega el `customProvider` activo al SDK.
5. El runtime conserva ese mismo contexto al crear el subagente, por lo que la
   petición usa el `modelId` global seleccionado.
6. No existe configuración separada para el agente auxiliar.

# Librerías usadas

- TypeScript.
- Bun test para las pruebas enfocadas.
- Infraestructura existente de comandos, agentes y proveedores.
- No se agregaron dependencias.

# Archivos importantes modificados

- `agents/general-agent/agent.ts`
- `agents/general-agent/general-agent.ts`
- `agents/general-agent/opus-agent.ts`
- `agents/base2/base2.ts`
- `agents/base2/base-deep.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/commands/__tests__/command-args.test.ts`
- `cli/src/commands/__tests__/router-input.test.ts`
- `common/src/tools/params/tool/spawn-agents.ts`
- `scripts/cleanup-agent-gpt5-obsoleto.py`
- `docs/agents-and-tools.md`
- `docs/custom-providers.md`
- `README.md`
- `AGENTS.md`

# Problemas encontrados

- El nombre público `GPT-5 Agent` describía un modelo concreto, no la función
  real del agente.
- El atajo `/agent:gpt-5` sugería que siempre se usaría GPT-5 aunque un proveedor
  personalizado global ya sustituyera el modelo.
- Añadir una selección por agente duplicaría `/models`, crearía dos fuentes de
  verdad y podría hacer que el usuario creyera que cambió el modelo global.

# Soluciones implementadas

- La plantilla integrada se renombró de `gpt-5-agent` a `agent`.
- El nombre visible cambió de `GPT-5 Agent` a `Agent`.
- El único atajo público es `/agent`, que inserta `@Agent `.
- Se eliminaron los alias ligados a GPT-5.
- Base2 y las descripciones de herramientas ahora permiten invocar `agent`.
- Se documentó que el modelo efectivo procede de la selección global de
  `/models` y se conserva la propagación existente hacia subagentes.
- Se añadieron pruebas para el comando, la metadata del slash command, la
  ausencia de alias antiguos y la identidad neutral de la plantilla.
- Se añadió un script de limpieza para retirar archivos agregados por la entrega
  anterior cuando el ZIP se copie encima de un proyecto existente.

# Validación realizada

- Pruebas de comandos, metadata, plantilla y propagación del proveedor:
  **81 aprobadas, 0 fallidas**.
- Pruebas de regresión de Base2: **24 aprobadas, 0 fallidas**.
- Pruebas del enrutamiento de modelos del SDK: **9 aprobadas, 0 fallidas**.
- Total de pruebas enfocadas: **114 aprobadas, 0 fallidas**.
- El typecheck del código fuente del CLI, excluyendo pruebas históricas, terminó
  correctamente.
- La generación de agentes integrados reconoció la plantilla con ID `agent` y
  nombre visible `Agent`.
- `git diff --check` no reportó errores de espacios ni finales de línea.
- El typecheck completo del CLI mantiene un error histórico en una prueba de
  `custom-providers` relacionado con el tipo extendido de `fetch`; el mismo
  error está presente antes de este cambio.
- La instalación completa de dependencias no pudo finalizar porque el módulo
  nativo `canvas` intentó descargar recursos externos y el entorno no resolvió
  DNS. Las dependencias instaladas fueron suficientes para ejecutar las pruebas
  enfocadas anteriores.

# Pendientes

- Probar en el binario que cambiar de proveedor/modelo con `/models` y ejecutar
  después `/agent` refleja el nuevo `modelId` en `/usage`.

# Próximos pasos

1. Compilar el CLI.
2. Seleccionar un proveedor/modelo en `/models`.
3. Ejecutar `/agent` y escribir la solicitud después de `@Agent `.
4. Confirmar en `/usage` que el subagente utilizó el mismo proveedor/modelo.
5. Cambiar el modelo global y repetir la prueba.
