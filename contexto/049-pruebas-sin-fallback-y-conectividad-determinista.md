# 049 - Pruebas sin fallback y conectividad determinista

## Motivo

Tras eliminar las dependencias automáticas del backend histórico de Codebuff, la suite conservaba cinco expectativas del comportamiento anterior:

1. `/models` esperaba volver al backend Codebuff al desactivar un provider.
2. ChatGPT OAuth esperaba caer al backend cuando había rate limit en modo no-free.
3. ChatGPT OAuth esperaba caer al backend cuando faltaban credenciales en modo no-free.
4. El test de timeout esperaba el mensaje heredado en inglés.
5. El test de socket caído esperaba tratar siempre el fallo como Internet general, aunque la nueva arquitectura diferencia provider de conectividad pública.

## Decisiones

- Desactivar el provider deja un estado explícito `Sin proveedor` (`modelId: none`).
- ChatGPT/Codex nunca cambia de ruta de forma implícita. Un rate limit conserva un error de rate limit y una sesión ausente conserva un error de autenticación, independientemente de `costMode`.
- Los errores OAuth durante streaming tampoco recursan con `skipChatGptOAuth` para buscar un backend alternativo: fallan con la causa real después del único intento de refresh permitido.
- Las pruebas de timeout/socket simulan Internet público disponible mediante `globalThis.fetch`, para no depender de la red de la máquina o CI.
- Un timeout de stream usa `FETCH_IDLE_TIMEOUT_USER_MESSAGE`.
- Un socket del provider cerrado mientras Internet público responde usa `PROVIDER_CONNECTION_ERROR_USER_MESSAGE`, no el mensaje de caída general de Internet.

## Archivos afectados

- `cli/src/utils/__tests__/custom-providers.test.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/impl/__tests__/model-provider-free-mode.test.ts`
- `sdk/src/impl/llm.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`

## Regla permanente

Las pruebas unitarias de clasificación de red no deben consultar Internet real. Deben fijar explícitamente el resultado de los probes para comprobar por separado:

- offline real -> esperar y reanudar;
- Internet disponible + fallo de transporte al provider -> error del provider/ruta;
- HTTP del provider -> conservar semántica HTTP/API sin entrar en modo offline.

No reintroducir expectativas de fallback al backend histórico de Codebuff.
