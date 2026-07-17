# 021 — Medidor permanente de la ventana de contexto

# Fecha

2026-07-15

# Objetivo

Mostrar en la barra inferior del chat el consumo actual de la ventana de
contexto del modelo activo, junto al proveedor, el estado de trabajo y el tiempo
transcurrido, para que el usuario pueda decidir cuándo ejecutar `/compact`.

# Decisiones tomadas

- El medidor representa el contexto actual del agente principal, no la suma
  acumulada de llamadas de `/usage`.
- La fuente de uso es
  `RunState.sessionState.mainAgentState.contextTokenCount`.
- El total es `maxContextTokens` del modelo activo, usando la misma resolución y
  los mismos valores de compatibilidad que la compactación automática.
- La barra de fondo representa capacidad restante: empieza llena y se vacía de
  derecha a izquierda conforme aumenta el contexto.
- El estado es normal por debajo de 75 %, advertencia desde 75 % y crítico desde
  90 %.
- Desde 80 % se muestra `/compact` como recordatorio visible.
- La línea permanece visible también cuando el agente está inactivo, siempre que
  exista un proveedor/modelo personalizado activo.
- Los snapshots en curso solo actualizan el medidor mientras pertenecen al chat
  activo; una ejecución abandonada no puede sobrescribir la cifra de otra
  conversación.
- Después de cada paso de un proveedor personalizado se vuelve a contar el
  historial persistido para incluir la salida recién generada.
- Una compactación manual exitosa recalcula inmediatamente el contexto desde la
  memoria resumida, el prompt de sistema y las herramientas.

# Arquitectura actual

```text
run-agent-step
   ├─ cuenta entrada antes de cada petición
   ├─ vuelve a contar historial al terminar cada paso
   └─ /compact vuelve a contar la memoria resumida
             ↓
RunState.mainAgentState.contextTokenCount
             ↓
onStateSnapshot / setRunState
             ↓
chat-store.contextTokenCount
             ↓
StatusBar
   ├─ modelo activo → maxContextTokens
   ├─ texto usado/total y porcentaje
   └─ fondo = porcentaje restante
```

`/usage` conserva otra responsabilidad: estadísticas acumuladas por llamada,
agente, proyecto y modelo. No alimenta el medidor de contexto.

# Librerías usadas

- TypeScript.
- React y OpenTUI existentes.
- Zustand existente para el estado del chat.
- Contador de tokens existente en `agent-runtime`.
- No se agregaron dependencias.

# Archivos importantes modificados

- `cli/src/components/status-bar.tsx`
- `cli/src/chat.tsx`
- `cli/src/state/chat-store.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/utils/context-window.ts`
- `packages/agent-runtime/src/run-agent-step.ts`
- `cli/src/utils/__tests__/context-window.test.ts`
- `cli/src/state/__tests__/chat-store-context-window.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `docs/token-usage.md`
- `README.md`
- `AGENTS.md`

# Problemas encontrados

- `/usage` acumula tokens de todas las peticiones y subagentes; usar ese total
  haría que la barra creciera varias veces por el mismo historial y no indicaría
  el riesgo real de desbordamiento.
- `contextTokenCount` se calculaba antes de la petición, por lo que el estado
  final podía quedar una respuesta por detrás al no incluir la última salida.
- `/compact` sustituía correctamente el historial por el resumen, pero conservaba
  temporalmente el conteo alto de la conversación anterior.
- Un snapshot tardío de una ejecución iniciada en otro chat podía actualizar un
  estado visual global si no se comprobaba primero la ruta/conversación activa.
- La barra de estado se ocultaba en reposo y solo aparecía al trabajar, desplazarse
  o utilizar una sesión Freebuff.

# Soluciones implementadas

- Se añadió un estado explícito `contextTokenCount` sincronizado con `RunState` y
  con snapshots en curso.
- Se agregó una utilidad pura para extraer, normalizar, formatear y clasificar el
  progreso de contexto.
- El runtime vuelve a contar el historial persistido después de cada paso local
  y después de una compactación manual.
- La TUI mantiene visible la barra cuando hay un modelo personalizado activo.
- El fondo de la misma franja visual se usa como indicador de capacidad restante,
  sin agregar una segunda línea que reduzca el espacio del chat.
- Se muestran tokens usados, tokens máximos, porcentaje y recordatorio de
  compactación en niveles altos.
- Se añadieron pruebas de cálculo, formato, sincronización del store y reducción
  del conteo después de `/compact`.


# Validaciones realizadas

- Utilidades y sincronización del estado: 8 pruebas aprobadas.
- Compactación manual y recálculo del contexto: 2 pruebas aprobadas.
- Límites de contexto, DeepSeek y umbral automático: 5 pruebas aprobadas.
- Typecheck del código fuente del CLI, excluyendo pruebas históricas: correcto.
- Typecheck del código fuente de `agent-runtime`, excluyendo pruebas históricas:
  correcto.
- El typecheck completo conserva errores previos ajenos al medidor: un mock de
  `fetch.preconnect` en `custom-providers.test.ts` y dos imports retirados de
  `agents-graveyard/researcher` en pruebas del runtime.

# Pendientes

- Probar visualmente en terminales muy estrechas para decidir si el nombre largo
  del proveedor debe truncarse antes que el medidor.
- Evaluar en un cambio separado un contador incremental durante una única salida
  extremadamente larga; el valor actual se actualiza al completar el paso o en
  el siguiente snapshot durable.
- Comparar el cálculo local con varios tokenizers específicos si se observa una
  desviación suficiente para justificar nuevas dependencias.

# Próximos pasos

1. Compilar el CLI y abrir una sesión nueva con un modelo de contexto conocido.
2. Enviar varias solicitudes y confirmar que la barra se vacía progresivamente.
3. Cambiar a un modelo con otra ventana y comprobar que el total se actualiza.
4. Ejecutar `/compact` y verificar que el uso desciende inmediatamente.
5. Reanudar otro chat desde `/history` y confirmar que recupera su propio conteo.
