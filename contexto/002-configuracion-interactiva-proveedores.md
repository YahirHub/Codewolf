# Cambio: configuración interactiva de proveedores

## Objetivo

Eliminar la configuración de proveedores/modelos mediante argumentos externos y concentrar toda la experiencia dentro del editor.

## Implementación

- `/login` abre un asistente de cuatro pasos: nombre, URL base, API key y modelos.
- La API key se muestra enmascarada.
- El campo de modelos acepta comas/saltos de línea o descubre automáticamente desde `/models` cuando queda vacío.
- `/models` abre un selector agrupado y ordenado por proveedor.
- El selector cambia proveedor y modelo en una sola operación persistente.
- Se agregó una opción interactiva para volver al backend de Codebuff.
- El editor completo abre sin autenticación previa, permitiendo configurar el primer proveedor.
- Se retiró el despacho especial de `provider` y `model` desde los argumentos del ejecutable.

## Validaciones requeridas

1. Iniciar Codebuff en una instalación sin token y comprobar que abre el editor.
2. Ejecutar `/login` y completar un proveedor con modelos manuales.
3. Repetir `/login` dejando modelos vacíos contra una API con `GET /models`.
4. Confirmar que la API key no se muestra ni aparece en el historial.
5. Abrir `/models`, recorrer grupos con flechas y cambiar entre dos proveedores.
6. Seleccionar `Codebuff / Backend predeterminado` y comprobar que se desactiva el override.
7. Ejecutar una tarea con subagentes y confirmar que usan el modelo activo.
