# 020 — Historial global de proyectos en `/history`

# Fecha

2026-07-14

# Objetivo

Permitir que `/history` muestre tanto las conversaciones del proyecto activo
como las sesiones guardadas en otras rutas conocidas, y que al elegir una de
ellas Codewolf cambie al proyecto correcto antes de reanudarla.

# Decisiones tomadas

- `/history` abre inicialmente la vista **Proyecto actual** para conservar el
  comportamiento existente.
- La tecla `Tab` alterna entre **Proyecto actual** y **Todos los proyectos**.
- La vista global muestra la ruta del proyecto y permite buscar por nombre de
  sesión, prompt, nombre de proyecto o ruta completa.
- La selección se identifica por la pareja `projectPath + chatId`; un mismo ID
  de chat puede existir en dos proyectos sin que la interfaz los confunda.
- Antes de reanudar una sesión de otra ruta se cancela cualquier ejecución
  activa, se cambia el directorio, se reinicia el cliente SDK y se recargan los
  agentes, MCP y skills específicos del proyecto.
- La eliminación desde la vista global usa el directorio de datos exacto del
  proyecto seleccionado; no elimina una sesión homónima de otra ruta.
- `recent-projects.json` conserva todas las rutas existentes conocidas. El
  selector inicial puede seguir mostrando solo las más recientes, mientras
  `/history` utiliza el registro completo.
- Para evitar bloquear la TUI con historiales muy grandes se cargan primero 25
  sesiones y después, en segundo plano, hasta 500 ordenadas globalmente por
  fecha.

# Arquitectura actual

```text
/history
   ├─ Proyecto actual
   │    └─ chats de ~/.codewolf/projects/<proyecto>/chats
   └─ Tab → Todos los proyectos
        ├─ recent-projects.json
        ├─ combina los directorios de chats conocidos
        ├─ ordena por modificación más reciente
        └─ Enter
             ├─ aborta el turno activo
             ├─ process.chdir(ruta seleccionada)
             ├─ setProjectRoot + resetCodebuffClient
             ├─ recarga .agents, mcp.json y .codewolf/skills
             └─ reanuda el chat seleccionado
```

`getChatsForProjects` recibe fuentes explícitas (`projectPath`, `dataDir`) y
produce entradas con metadatos del proyecto. `getAllProjectChats` construye esas
fuentes a partir del proyecto activo y de todas las rutas existentes guardadas
en `recent-projects.json`.

# Librerías usadas

- TypeScript.
- React.
- OpenTUI.
- Bun test.
- Módulos estándar `fs` y `path`.
- No se agregaron dependencias.

# Archivos importantes modificados

- `cli/src/components/chat-history-screen.tsx`
- `cli/src/app.tsx`
- `cli/src/index.tsx`
- `cli/src/project-files.ts`
- `cli/src/utils/chat-history.ts`
- `cli/src/utils/recent-projects.ts`
- `cli/src/utils/local-agent-registry.ts`
- `cli/src/hooks/use-searchable-list.ts`
- `cli/src/utils/__tests__/chat-history.test.ts`
- `cli/src/hooks/__tests__/use-searchable-list.test.ts`
- `README.md`
- `AGENTS.md`
- `docs/chat-sessions.md`

# Problemas encontrados

- `/history` solo consultaba el directorio de datos del proyecto activo.
- La selección devolvía únicamente `chatId`, por lo que no podía saber a qué
  ruta pertenecía una sesión global.
- El registro de proyectos recientes se truncaba y perdía rutas antiguas que
  después ya no podían descubrirse.
- Las búsquedas que comenzaban con `/` o `~` se trataban como navegación de
  rutas y no se filtraban, comportamiento correcto para el selector de
  proyectos pero incorrecto para buscar rutas dentro del historial.
- Cambiar de ruta sin reiniciar el proceso dejaba en memoria agentes, MCP y
  skills del proyecto anterior.
- La persistencia heredada usa el nombre final de la carpeta como directorio de
  datos. Dos rutas distintas con el mismo nombre base pueden compartir el mismo
  almacén; la vista global evita duplicarlo, pero una migración a identificadores
  derivados de la ruta completa queda fuera de este cambio.

# Soluciones implementadas

- Se añadieron pestañas visibles y alternancia por `Tab`.
- Se agregó una columna de proyecto en la vista global y búsqueda por ruta.
- La selección ahora transporta `{ chatId, projectPath }`.
- El componente padre cambia de proyecto antes de cerrar el historial y solo
  continúa si el cambio de ruta tuvo éxito.
- La clave del chat incluye proyecto y sesión para forzar un montaje limpio al
  reanudar desde otra ruta.
- La lista global combina y ordena sesiones antes de leer los archivos de
  mensajes, reduciendo trabajo innecesario.
- El borrado recibe el `dataDir` correspondiente a la fila elegida.
- El registro de proyectos dejó de truncarse y también registra aperturas
  directas desde el directorio del proyecto.
- `useSearchableList` recibió una opción específica para permitir filtrado de
  consultas que parecen rutas sin alterar el selector de directorios.
- `initializeAgentRegistry` invalida sus cachés dependientes de ruta y el cambio
  de proyecto recarga agentes y skills antes de reanudar.

# Validación realizada

- Pruebas enfocadas de historial, rutas de chat, búsqueda y comandos:
  **146 aprobadas, 0 fallidas**.
- Prueba de integración de reinicialización del registro de agentes después de
  ejecutar `prebuild:agents`: **1 aprobada, 0 fallidas**.
- Total validado: **147 pruebas aprobadas, 0 fallidas**.
- Typecheck del código fuente del CLI, excluyendo pruebas históricas:
  correcto.
- El typecheck completo conserva un error histórico ajeno a este cambio en
  `custom-providers.test.ts`: el mock de `fetch` no declara `preconnect`.
- Prettier aplicado a los archivos modificados.

# Pendientes

- Probar manualmente en Windows una ruta con espacios y otra unidad de disco.
- Evaluar en un cambio separado la migración del almacenamiento basado en el
  nombre de carpeta a una clave única derivada de la ruta completa.
- Las rutas que versiones anteriores ya expulsaron del antiguo límite de
  recientes deben abrirse una vez para volver a registrarse.

# Próximos pasos

1. Abrir Codewolf en varios proyectos para registrarlos.
2. Ejecutar `/history` en uno de ellos.
3. Pulsar `Tab` y buscar otro proyecto por nombre o ruta.
4. Reanudar una sesión y confirmar que el directorio, agentes, skills y archivos
   visibles corresponden al proyecto seleccionado.
5. Probar el borrado de dos chats con el mismo ID en fuentes distintas.
