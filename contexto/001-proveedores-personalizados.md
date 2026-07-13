# Proveedores personalizados

## Estado actual

Codebuff admite proveedores OpenAI-compatible como reemplazo global del backend de modelos. El proveedor y modelo activos se aplican al agente principal y a todos sus subagentes.

La configuración de usuario se divide en:

- `providers.json`: metadatos, URL, modelos y selección activa.
- `provider-auth.json`: claves directas separadas de los metadatos.

## Interfaz vigente

La administración externa mediante `codebuff provider ...` y `codebuff model ...` fue retirada.

Dentro del editor:

- `/login` abre el asistente interactivo para registrar o actualizar un proveedor.
- `/models` abre el selector agrupado por proveedor.
- El selector permite volver al backend predeterminado de Codebuff.

El editor completo puede abrir sin credenciales previas para que `/login` esté disponible en una instalación nueva.

## Descubrimiento de modelos

En el último paso de `/login`:

- Una lista escrita se divide por comas o saltos de línea.
- Un campo vacío consulta `GET <base-url>/models`.
- Si existe clave, se envía como `Authorization: Bearer`.
- Se reconocen arrays directos y las propiedades `data`, `models` o `results`.
- La consulta tiene timeout de 15 segundos y no guarda una configuración incompleta si falla.

## Reglas de seguridad

- La API key se captura en un input enmascarado.
- No se inserta en el prompt, historial, conversación ni título de terminal.
- Se permite dejar la clave vacía para APIs locales.
- Cada cambio de proveedor/modelo reinicia el cliente SDK cacheado.
- Freebuff no expone estos flujos.

## Archivos principales

- `cli/src/components/provider-login-screen.tsx`
- `cli/src/components/model-selector-screen.tsx`
- `cli/src/utils/custom-providers.ts`
- `cli/src/state/custom-provider-store.ts`
- `cli/src/commands/provider.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `cli/src/chat.tsx`
- `cli/src/index.tsx`
- `sdk/src/impl/model-provider.ts`
