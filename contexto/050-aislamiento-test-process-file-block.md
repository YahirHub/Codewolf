# 050 - Aislamiento del test processFileBlock

## Motivo

La suite completa podía terminar con un único fallo reportado por Bun como:

`processFileBlockModule > (unnamed)`

El archivo `process-file-block.test.ts` registraba en `beforeAll` un mock global de `pg-pool` mediante `mock.module`, aunque `processFileBlock` y `cleanMarkdownCodeBlock` no utilizan base de datos. Al fallar o colisionar ese hook global durante la ejecución conjunta de la suite, Bun atribuía el error al `describe` y lo mostraba como un test sin nombre.

## Cambio

- Se eliminó el mock global de `pg-pool` y su limpieza global.
- Se eliminaron `beforeAll`/`afterAll` innecesarios.
- El test dejó de crear una copia completa de `TEST_AGENT_RUNTIME_IMPL` para obtener únicamente el logger.
- Se usa directamente `testLogger`, reduciendo las dependencias y efectos secundarios del archivo de pruebas.

## Regla permanente

Los tests unitarios de utilidades puras o funciones que solo reciben dependencias explícitas no deben registrar mocks globales de módulos no utilizados. Un hook global innecesario puede hacer que Bun reporte fallos `(unnamed)` y crear interferencias entre archivos cuando la suite se ejecuta completa.
