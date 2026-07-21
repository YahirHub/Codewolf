# 056 — Auto-scroll del administrador de proveedores

# Fecha

2026-07-20

# Objetivo

Corregir la navegación de `/providers` para que la lista se desplace automáticamente al seleccionar con el teclado proveedores u opciones que quedan fuera del área visible, igual que la pantalla `/config`.

# Archivos importantes modificados

- `cli/src/components/provider-manager-screen.tsx`
- `cli/src/utils/provider-manager-scroll.ts`
- `cli/src/components/__tests__/provider-manager-scroll.test.ts`

# Problemas encontrados

- El índice seleccionado avanzaba correctamente con las flechas, pero el `scrollbox` de `/providers` no tenía referencia ni sincronización con `scrollTop`.
- Las filas no tienen una altura uniforme: los proveedores ocupan cuatro líneas y las acciones **Agregar proveedor** y **Cerrar** ocupan tres.

# Soluciones implementadas

- Se añadió una referencia al `scrollbox` y un efecto que mantiene la fila seleccionada completamente dentro del viewport.
- El cálculo respeta la altura real de cada tipo de fila y funciona al navegar hacia arriba, hacia abajo o mediante hover.
- Se aisló la geometría del scroll en utilidades puras y se agregaron regresiones para límites, desplazamiento descendente, desplazamiento ascendente y selección ya visible.

# Validación

- Se verificó estáticamente que `/providers` usa el mismo patrón de `ref`, `viewport`, `scrollTop` y actualización por cambio de selección que `/config`.
- La ejecución de la prueba Bun y del typecheck completo queda pendiente porque el ZIP no incluye `node_modules` y Bun no está instalado en este entorno.

# Próximos pasos

- Ejecutar la prueba enfocada y el typecheck con Bun 1.3.14.
- Abrir `/provider` o `/providers`, recorrer una lista mayor que el viewport y confirmar que **Agregar proveedor** y **Cerrar** siempre aparecen al seleccionarlos.
