# 037 — Consistencia del cambio de modelo por tarea

# Fecha

2026-07-16

# Objetivo

Evitar que una selección realizada en `/models` durante una tarea activa mezcle modelos dentro de la misma ejecución o muestre en la interfaz un modelo distinto del realmente utilizado.

# Decisiones tomadas

- El proveedor y modelo se congelan al enviar cada solicitud.
- Un cambio realizado desde `/models` durante una ejecución se reserva para la siguiente tarea.
- Los subagentes sin asignación específica usan el modelo congelado de su tarea.
- Las preferencias específicas de `/config` mantienen prioridad sobre la herencia de sesión.

# Soluciones implementadas

- El cliente conserva una instantánea del proveedor, modelo y ventana de contexto al comenzar el turno.
- La barra de estado muestra `En uso` para la tarea activa y `Siguiente` cuando existe una selección pendiente.
- El selector de modelos informa que una selección durante una tarea se aplicará después.
- Se protegió la caché del cliente contra inicializaciones antiguas que terminen después de un cambio de modelo.

# Validación realizada

- Se añadieron pruebas para congelar el modelo de la tarea, conservar el propietario de la ejecución y evitar que un cliente anterior sustituya la selección nueva.
