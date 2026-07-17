# 011 - Deduplicación de subagentes reproducidos

## Problema

Los proveedores OpenAI-compatible podían reproducir una llamada de herramienta ya completa usando otro índice o identificador. Además, un modelo podía expresar la misma solicitud como herramienta directa del agente y como `spawn_agents`. El runtime trataba ambos eventos como trabajos distintos y la TUI podía conservar simultáneamente el marcador provisional y la tarjeta real.

El síntoma visible eran dos tarjetas idénticas de `researcher-web` para una sola consulta, por ejemplo dos investigaciones de Debian o Laravel.

## Solución

La protección se aplica en tres límites:

1. El parser OpenAI-compatible relaciona las partes por el ID entregado por el proveedor y emite cada tool call una sola vez, aunque cambie su índice.
2. El runtime convierte primero las herramientas directas de agentes a `spawn_agents` y calcula una firma estable con tipo normalizado, prompt y params. En una respuesta del modelo solo ejecuta una vez cada firma, incluso si aparece repetida dentro del mismo arreglo o en otra llamada.
3. La TUI conserva un mapa semántico inmediato. El marcador temporal se transforma en la tarjeta del `subagent_start`; no se crea una segunda tarjeta cuando el evento se reproduce con otro ID.

La comparación de params ordena sus claves, normaliza datos JSON y también normaliza aliases como `researcher_web`, `researcher-web` y `codebuff/researcher-web@1.0.0`.

## Compatibilidad

- Solicitudes con prompts distintos siguen siendo independientes.
- Solicitudes con el mismo prompt pero params distintos siguen siendo independientes.
- `handleSpawnAgents` mantiene su deduplicación defensiva y el mapeo de resultados para llamadas directas al handler.
- Los timeouts y la finalización garantizada implementados anteriormente permanecen activos.

## Pruebas

Se cubren:

- repetición del mismo ID de tool call en otro índice del stream;
- duplicados dentro de un mismo `spawn_agents`;
- duplicados en tool calls separados;
- aliases directos frente al nombre canónico;
- marcadores temporales y eventos reales desordenados;
- eventos `subagent_start` repetidos con el mismo o con distinto ID;
- agentes del mismo tipo y prompt diferenciados por params.
