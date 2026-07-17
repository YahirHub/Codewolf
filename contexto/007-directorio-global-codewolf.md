# 007 - Directorio global unificado de Codewolf

## Objetivo

Separar la persistencia local de Codewolf de las rutas heredadas del proyecto original y utilizar una única carpeta global en todos los sistemas operativos y modos de ejecución.

## Ruta única

Codewolf utiliza directamente la carpeta home del usuario:

- Windows: `C:\Users\<usuario>\.codewolf`
- Linux: `/home/<usuario>/.codewolf`
- macOS: `/Users/<usuario>/.codewolf`

No se utiliza `.config`, `manicode`, sufijos `-dev`, `-test` ni rutas distintas para el binario.

## Estructura

```text
~/.codewolf/
├── providers.json
├── provider-auth.json
├── credentials.json
├── settings.json
├── message-history.json
├── recent-projects.json
├── projects/
└── skills/
```

La carpeta raíz, `skills/` y `projects/` se crean automáticamente al iniciar Codewolf.

## Desarrollo y binario

Los siguientes modos comparten exactamente los mismos archivos:

- `bun run dev`
- `npm run dev`, cuando npm ejecuta el script raíz
- `codebuff.exe` o el binario compilado equivalente

Una configuración creada mediante `/login` en desarrollo queda disponible inmediatamente al ejecutar el binario, y viceversa.

## Skills

Las skills se descubren en este orden:

1. `~/.codewolf/skills/`
2. `<proyecto>/.codewolf/skills/`

Una skill del proyecto reemplaza una skill global con el mismo nombre. Ya no se buscan skills globales en `~/.agents/skills` ni en `~/.claude/skills`.

Cada skill mantiene la estructura:

```text
~/.codewolf/skills/mi-skill/SKILL.md
```

## Compatibilidad

No se realiza migración automática desde las carpetas heredadas. Esto evita seguir dependiendo de nombres o ubicaciones del proyecto original. Los proveedores pueden configurarse nuevamente con `/login` o copiarse manualmente a la nueva carpeta si el usuario decide conservarlos.
