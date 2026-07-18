# 052 - Build Windows con binario bloqueado y tipado de mocks fetch

## Problema

La suite completa fallaba por dos causas independientes:

1. `common/src/util/__tests__/internet-connectivity.test.ts` dejaba el parámetro `input` de un mock de `fetch` sin tipo explícito bajo `noImplicitAny`.
2. `bun build --compile --outfile=cli/bin/codewolf.exe` fallaba con `EPERM` en Windows cuando `codewolf.exe` estaba abierto o bloqueado por otro proceso. La compilación terminaba, pero Bun no podía mover el ejecutable temporal sobre el destino bloqueado.

## Solución

- El mock de conectividad tipa su argumento como `Parameters<typeof fetch>[0]` y mantiene la conversión deliberada `as unknown as typeof fetch` requerida por los tipos de Bun que añaden miembros estáticos como `preconnect`.
- `cli/scripts/build-binary.ts` compila siempre a un archivo temporal único dentro de `cli/bin` y solo después intenta promoverlo al nombre canónico.
- Si Windows permite reemplazar el destino, el nuevo binario queda normalmente como `codewolf.exe`.
- Si Windows devuelve `EPERM`, `EACCES` o `EBUSY` porque `codewolf.exe` está en uso, el build conserva el binario recién compilado como `codewolf.next.exe` (o una variante con timestamp si ese nombre también está bloqueado), muestra una advertencia clara y finaliza correctamente.
- El build no mata procesos ni fuerza el cierre de una instancia activa de Codewolf.
- Una ejecución posterior del build, después de cerrar el binario antiguo, vuelve a instalar normalmente el resultado como `codewolf.exe`.

## Regla permanente

Los builds de binarios Windows no deben compilar directamente sobre el nombre canónico de un `.exe` que puede estar ejecutándose. Usar staging y promoción posterior. Un bloqueo del ejecutable instalado no invalida que la compilación nueva haya sido exitosa; debe preservarse el artefacto nuevo de manera explícita y segura sin terminar procesos del usuario.
