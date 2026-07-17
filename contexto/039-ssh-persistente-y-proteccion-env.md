# 039 — SSH persistente y protección de archivos `.env`

# Fecha

2026-07-17

# Objetivo

Agregar una herramienta interna de Codewolf para conservar varias conexiones SSH entre llamadas, navegar y leer servidores, transferir archivos y ejecutar comandos o shells persistentes, con permisos configurables y protección independiente para secretos de `.env`.

# Decisiones tomadas

- SSH es una capacidad del agente, no una pantalla ni función directa para el usuario.
- Cada conexión recibe un `connection_id` y una referencia `ssh://<id>` reutilizable durante el proceso actual del CLI.
- El gestor admite varias conexiones simultáneas, conserva sus IDs al cambiar de proyecto dentro del mismo proceso y permite cerrar una o todas globalmente.
- La navegación, lectura normal, consulta de estado y cierre no requieren permiso del Modo seguro SSH.
- Conectar, ejecutar, abrir o escribir shells, transferir y mutar archivos remotos requieren autorización individual cuando el Modo seguro SSH está activo.
- El Modo seguro SSH queda activo por defecto; el Modo seguro local conserva su valor predeterminado desactivado.
- La protección de `.env` es independiente y queda activa por defecto incluso en modo normal.
- Consultar metadatos o navegar un `.env` no expone su contenido y no solicita el permiso especial; leerlo, descargarlo, subir un `.env` local o usar comandos que puedan mostrarlo sí lo solicita.
- `.env.example`, `.env.sample`, `.env.template`, `.env.dist` y `.env.defaults` se consideran plantillas no secretas.
- Las credenciales no se incluyen en resultados y la vista previa de permisos oculta contraseñas, tokens, claves y secretos.

# Arquitectura actual

1. `common` define el esquema `ssh_remote`, categorías de permisos y detección de archivos de entorno protegidos.
2. `packages/agent-runtime` publica la herramienta y transporta identidad del agente y llamada hasta el cliente.
3. `sdk` autoriza la operación antes de ejecutarla y mantiene un único `PersistentSshManager` durante el proceso actual de Codewolf.
4. El gestor conserva clientes `ssh2`, SFTP, directorio remoto y shell PTY en memoria; las rutas locales de cada transferencia se resuelven con el proyecto de la llamada actual.
5. `cli` conecta la cola FIFO de permisos con la TUI y lee las tres políticas desde `~/.codewolf/settings.json`.
6. Base2 y el agente auxiliar pueden invocar `ssh_remote`; PLAN permanece sin capacidad SSH.

# Librerías usadas

- `ssh2` para cliente SSH, ejecución remota, PTY y SFTP.
- `@types/ssh2` para typecheck estricto del SDK.
- Bun, TypeScript y Zod ya existentes.

# Archivos importantes modificados

- `common/src/tools/params/tool/ssh-remote.ts`
- `common/src/tools/constants.ts`
- `common/src/tools/list.ts`
- `common/src/types/tool-permission.ts`
- `common/src/util/tool-permission.ts`
- `common/src/util/protected-env.ts`
- `packages/agent-runtime/src/tools/handlers/tool/ssh-remote.ts`
- `packages/agent-runtime/src/tools/handlers/list.ts`
- `packages/agent-runtime/src/tools/tool-executor.ts`
- `sdk/src/tools/ssh-remote.ts`
- `sdk/src/tools/read-files.ts`
- `sdk/src/tools/code-search.ts`
- `sdk/src/run.ts`
- `cli/src/utils/settings.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/components/config-screen.tsx`
- `cli/src/components/tool-permission-screen.tsx`
- `cli/src/chat.tsx`
- `agents/base2/base2.ts`
- `agents/base2/base-deep.ts`
- `agents/general-agent/general-agent.ts`
- `sdk/package.json`
- `bun.lock`
- `cli/scripts/build-binary.ts`

# Soluciones implementadas

- Acciones para conectar, listar conexiones, consultar estado, navegar, leer, ejecutar, abrir shell persistente, transferir, escribir, crear, renombrar, eliminar y cerrar.
- Directorio remoto persistente para `exec` y SFTP.
- Cola serial por conexión para evitar carreras entre el agente principal y subagentes.
- Shell PTY con búfer acotado y lectura incremental.
- Límites de salida, timeout de comandos, cancelación y errores estructurados.
- Subidas y descargas con protección contra sobrescritura accidental.
- Autenticación por contraseña, variable de entorno, clave privada o agente SSH y verificación SHA-256 opcional del host.
- Políticas independientes `safeModeEnabled`, `sshSafeModeEnabled` y `protectEnvFiles`; cuando una operación SSH también expone `.env`, se solicitan ambos permisos.
- Protección `.env` aplicada a lecturas locales, búsquedas, comandos y operaciones SSH que puedan exponer contenido.
- Búsquedas amplias excluyen `.env*` cuando la protección está activa; una búsqueda explícita exige permiso.
- Solicitudes de subagentes muestran su identidad y comparten la misma cola de autorización.

# Problemas encontrados

- La interfaz y la cola de permisos ya existían, pero el SDK y la TUI no estaban conectados de extremo a extremo para todas las herramientas.
- La detección inicial de `.env` era demasiado amplia y podía pedir permiso por `stat` o navegación sin leer contenido; además, una autorización `.env` podía sustituir accidentalmente la autorización SSH de la misma operación.
- La primera validación del esquema exigía `path` para `list`, aunque el gestor ya podía usar el directorio actual; la resolución remota con `cwd="."` también podía heredar por error la ruta local del proceso.
- El entorno de trabajo no permitió instalar todo el monorepo desde su registro configurado; se validó el nuevo cliente con un entorno aislado y tipos reales.

# Pruebas realizadas

- Ejecución de siete suites enfocadas de permisos, cola de autorización, SSH, lectura, búsqueda, configuración y capacidades del agente: 96 pruebas aprobadas, 277 verificaciones.
- El bloque específico de permisos y SSH aporta 14 pruebas y 65 verificaciones; lectura protegida aporta 26/44, búsqueda protegida 32/103 y capacidades Base2/PLAN 13/36, cola FIFO de permisos 2/10 y configuración de seguridad 9/19.
- Typecheck estricto aislado de `sdk/src/tools/ssh-remote.ts` con `ssh2` y `@types/ssh2`: aprobado.
- Transpilación sintáctica de los archivos TypeScript/TSX modificados: aprobada.
- Compilación mínima Bun con `ssh2` y `--external=cpu-features`: aprobada; el ejecutable inició y creó un cliente SSH.

# Riesgos

- Las conexiones no sobreviven al reinicio del proceso; solo su identificador vive durante la sesión actual.
- Una huella de host omitida permite confiar en la negociación normal de `ssh2`; producción debe proporcionar la huella esperada cuando sea posible.
- Los comandos remotos siguen teniendo los privilegios del usuario SSH configurado.
- Los procesos de transferencia no se reanudan automáticamente después de una desconexión.

# Pendientes

- Probar conexión real contra servidores Windows y Linux controlados, incluyendo SFTP, PTY y desconexión inesperada.
- Ejecutar la suite completa y `bun run build:binary` en un entorno con las dependencias completas del monorepo.
- Evaluar reconexión opcional sin persistir credenciales si una conexión se corta durante una tarea larga.

# Próximos pasos

- Desde `/config`, verificar los tres toggles de seguridad y probar permitir/rechazar con agente principal y subagente.
- Compilar el binario en Windows y validar que varias conexiones continúan utilizables hasta cerrar una o ejecutar `close_all`.
