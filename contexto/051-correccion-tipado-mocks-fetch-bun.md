# 051 - Corrección del tipado de mocks `fetch` con Bun

## Problema

Después de desacoplar la conectividad del backend heredado, las pruebas que sustituyen `globalThis.fetch` dejaron de pasar el typecheck con las versiones actuales de los tipos de Bun.

Bun amplía `typeof fetch` con el miembro estático `preconnect`. Un mock unitario definido como una función `async` simple es compatible con la parte invocable en ejecución, pero TypeScript no permite convertirlo directamente a `typeof fetch` porque la función mock no declara ese miembro estático.

Los errores aparecían en los paquetes `common`, `agent-runtime` y `sdk`.

## Solución

Los mocks intencionales de `fetch` utilizados exclusivamente en pruebas se convierten mediante la frontera explícita:

```ts
mockImplementation as unknown as typeof fetch
```

Esto deja claro al compilador que el test reemplaza deliberadamente la función global completa. No cambia el comportamiento de producción, no añade una implementación falsa de `preconnect` y no modifica la lógica de detección de Internet ni recuperación del provider.

## Archivos

- `common/src/util/__tests__/internet-connectivity.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `sdk/src/__tests__/model-provider.test.ts`

## Regla

Cuando una prueba de Bun sustituya `globalThis.fetch` o entregue un mock a una API tipada como `typeof fetch`, no asumir que una función `async` simple satisface la interfaz completa de Bun. Para mocks aislados puede usarse la conversión explícita a través de `unknown`; el código de producción debe conservar los tipos estrictos reales.
