# 045 — Corrección del puerto implícito en `connect_server`

## Fecha

2026-07-17

## Objetivo

Permitir que `ssh_remote.connect_server` utilice un servidor guardado enviando
únicamente `server_id`, sin que el esquema inyecte el puerto 22 y lo interprete
erróneamente como una modificación solicitada por el agente.

## Causa

El campo compartido `port` usaba `default(22).optional()` en el esquema Zod.
Zod añadía `port: 22` antes de ejecutar `superRefine`, incluso cuando el agente
no había enviado ese campo. La validación de `connect_server` detectaba entonces
un valor distinto de `undefined` y rechazaba una llamada válida.

El mismo valor implícito también hacía que un `update_server` sin cambios
explícitos pareciera contener una actualización de puerto.

## Solución

- Se eliminó el valor predeterminado del esquema compartido de `port`.
- El puerto permanece opcional en la entrada validada.
- El valor predeterminado 22 continúa aplicándose en el runtime SSH y en el
  registro de servidores mediante `input.port ?? 22`.
- Se conserva la validación que impide enviar explícitamente `host`, `port`,
  `username` o nombre en `connect_server`; esos datos deben editarse mediante
  `update_server`.
- Se añadieron pruebas de regresión para `connect_server`, conexión directa y
  `update_server` sin campos.

## Archivos modificados

- `common/src/tools/params/tool/ssh-remote.ts`
- `sdk/src/tools/__tests__/ssh-remote.test.ts`
- `AGENTS.md`
- `contexto/045-correccion-puerto-implicito-connect-server.md`

## Validación

- Ambos archivos TypeScript modificados se transpilan sin errores sintácticos.
- Una prueba aislada con Zod 4.2.1 confirma que `connect_server` conserva
  `port === undefined` cuando el agente no lo envía.
- La misma prueba confirma que `update_server` sin cambios explícitos vuelve a
  rechazarse.
- Queda pendiente ejecutar la suite completa con Bun en Windows.

## Prueba manual

```json
{
  "action": "connect_server",
  "server_id": "Servidor ARM Oracle Cloud ARM64"
}
```

La llamada debe pasar la validación y usar el host, usuario, puerto y
credenciales almacenados en el perfil.
