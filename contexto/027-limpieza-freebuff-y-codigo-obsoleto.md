# 027 — Limpieza de Freebuff y código obsoleto

# Fecha

2026-07-15

# Objetivo

Eliminar del monorepo las superficies heredadas de Freebuff y los archivos que ya no son alcanzables por Codewolf, reduciendo dependencias, ramas condicionales y mantenimiento duplicado sin romper el SDK compatible existente.

# Decisiones tomadas

- Se eliminó el workspace completo `freebuff/` y sus agentes, sesiones, anuncios, referencias, límites comerciales y pruebas exclusivas.
- Se retiraron empaquetadores y scripts de release obsoletos que ya no participan en `build:binary` ni `build:sdk`.
- Se eliminaron componentes, hooks, stores, tipos y utilidades sin importadores o reservados para superficies comerciales retiradas.
- Se conservaron `@codebuff/*`, `CodebuffClient`, variables `CODEBUFF_*` y tipos públicos equivalentes porque siguen siendo namespaces activos del SDK y del backend compatible; renombrarlos requiere una migración independiente.
- Se conservaron `LICENSE`, `NOTICE` y atribuciones legales aunque mencionen el origen del proyecto.
- Se mantuvo `--free` únicamente como alias obsoleto de `LITE` y `costMode: 'free'` como compatibilidad del protocolo; ninguno activa Freebuff.

# Arquitectura actual

- La raíz ya no incluye el workspace `freebuff`.
- El CLI usa un solo flujo Codewolf para autenticación, selección de modos, envío de mensajes, historial y estado.
- `LITE` usa `base2-lite` y un revisor ligero sin variantes Freebuff por modelo.
- La publicación del binario se concentra en `cli/scripts/build-binary.ts`; los wrappers npm retirados dejaron de formar parte del proyecto.
- El SDK conserva su namespace histórico para no romper imports ni consumidores existentes.

# Librerías usadas

No se agregaron dependencias.

Se retiraron dependencias directas sin importadores o pertenecientes a capas eliminadas:

- CLI: `@gravity-ai/api`, `posthog-node`, `react-reconciler`, `terminal-image`, `yoga-layout` y `@types/react-reconciler`.
- Common: `@auth/drizzle-adapter`, `next-auth`, `partial-json`, `pg`, `readable-stream`, `stripe`, `@types/pg` y `@types/readable-stream`.
- `@types/seedrandom` se movió a `devDependencies`.

# Archivos importantes modificados

- `package.json`
- `bun.lock`
- `cli/package.json`
- `common/package.json`
- `agents/base2/base2.ts`
- `cli/src/app.tsx`
- `cli/src/chat.tsx`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/data/slash-commands.ts`
- `scripts/cleanup-codewolf-obsolete.ps1`

# Problemas encontrados

- El workspace Freebuff seguía presente aunque Codewolf ya no debía exponer esa edición.
- Existían variantes duplicadas de Base2 y revisores asociadas a modelos gratuitos retirados.
- El CLI conservaba sesiones, banners, anuncios, créditos, suscripciones, referidos y telemetría comercial sin una ruta válida en Codewolf.
- Los antiguos wrappers de release y su documentación permanecían fuera del build actual.
- Varios archivos genéricos no eran alcanzables desde la entrada del CLI.
- La primera pasada de limpieza eliminó accidentalmente auxiliares compartidos de comandos y el identificador del mensaje de streaming; se restauraron antes de la entrega y se añadieron comprobaciones de imports y tipos internos.

# Soluciones implementadas

- Se eliminaron 163 archivos existentes y el workspace completo Freebuff.
- Se simplificaron las ramas de ejecución a `DEFAULT`, `LITE`, `MAX` y `PLAN`.
- Se restauraron y validaron el registro dinámico de skills, los comandos sin `/` y el ID del mensaje activo de streaming.
- Se comprobó que los 297 archivos de producción del CLI son alcanzables desde `cli/src/index.tsx`, salvo declaraciones generadas o ambientales esperadas.
- Se agregó un script PowerShell seguro, con soporte para `-WhatIf`, para borrar archivos obsoletos al superponer el ZIP sobre una copia existente.
- Se mantuvieron intactos los contratos internos que todavía usan el namespace histórico.

# Pendientes

- Ejecutar `bun install --frozen-lockfile`, typecheck, pruebas y build completo en un entorno con Bun y dependencias instaladas.
- Decidir en una migración separada si el namespace público `@codebuff/*` y `CodebuffClient` debe renombrarse con aliases de compatibilidad.
- Revisar los tres imports históricos rotos que ya existían en pruebas de `agent-runtime` y `code-map`.

# Próximos pasos

- Ejecutar primero `scripts/cleanup-codewolf-obsolete.ps1 -WhatIf` y después sin `-WhatIf` si el ZIP se copiará encima de una versión anterior.
- Instalar dependencias y validar el binario de Windows y Linux antes de publicar.
