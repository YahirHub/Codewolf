# 014 — Contexto persistente, workflow manual y edición sin monetización

# Fecha

2026-07-14

# Objetivo

> Nota histórica: este documento describe la eliminación del antiguo `/usage` comercial. El comando fue recuperado posteriormente en `015-estadisticas-locales-de-tokens.md` con una implementación totalmente local, sin precios, créditos ni suscripciones.

Adoptar una metodología persistente basada en `contexto/`, reforzar la
visibilidad de la ejecución manual de GitHub Actions y retirar las superficies
activas de anuncios, créditos y suscripciones del CLI personalizado.

# Decisiones tomadas

- `contexto/000-contexto-maestro.md` es el primer archivo que debe leerse al
  retomar el proyecto desde un ZIP.
- Los archivos de contexto se leen en orden numérico y el documento más reciente
  prevalece sobre decisiones antiguas cuando exista una contradicción.
- El workflow conserva un único runner Linux y un activador exclusivamente
  manual mediante `workflow_dispatch`, sin parámetros ni versión escrita por el usuario.
- La edición personalizada no contiene comandos de suscripción, uso/créditos ni
  control de anuncios.
- Los errores del proveedor no deben transformar el editor en un diálogo de
  compra ni consultar estado comercial del backend heredado.

# Arquitectura actual

La arquitectura principal no cambia. Se simplifica la capa visible del CLI:

- `SLASH_COMMANDS` solo contiene funciones disponibles en Codewolf.
- `command-registry` ya no registra handlers comerciales.
- `Chat` no consulta suscripciones, no solicita anuncios y no monitorea créditos.
- Los resultados siguen renderizándose mediante el mismo store; los callbacks
  heredados de anuncios quedan como funciones vacías para conservar el contrato
  interno hasta una limpieza estructural posterior.

# Librerías usadas

No se agregaron ni actualizaron dependencias.

# Archivos importantes modificados

- `.github/workflows/build-binaries.yml`
- `cli/src/data/slash-commands.ts`
- `cli/src/commands/ads.ts`
- `scripts/cleanup-commercial-cli.py`
- `cli/src/commands/command-registry.ts`
- `cli/src/components/help-banner.tsx`
- `cli/src/chat.tsx`
- `cli/src/components/chat-input-bar.tsx`
- `cli/src/components/input-mode-banner.tsx`
- `cli/src/components/message-footer.tsx`
- `cli/src/utils/keyboard-actions.ts`
- `cli/src/hooks/use-chat-keyboard.ts`
- `cli/src/hooks/helpers/send-message.ts`
- `contexto/000-contexto-maestro.md`
- `AGENTS.md`
- `README.md`
- `docs/build-binaries.md`

# Problemas encontrados

- El workflow era sintácticamente manual, pero GitHub solo muestra el botón si
  el archivo está en la rama predeterminada y Actions está habilitado.
- La interfaz todavía registraba `/subscribe`, `/usage`, `/ads:enable` y
  `/ads:disable` junto con alias comerciales.
- El chat seguía consultando datos de suscripción, uso y anuncios aunque los
  proveedores personalizados no requieren esa infraestructura.
- Los errores de créditos podían bloquear el input con una pantalla de compra.

# Soluciones implementadas

- Se declaró un disparador `workflow_dispatch` explícito sin parámetros.
- Se actualizaron las acciones oficiales usadas por el workflow.
- Se documentó el comando alternativo de GitHub CLI para disparar el workflow.
- Se eliminaron comandos, alias, ayuda, indicadores, banners, consultas y
  transiciones activas relacionadas con monetización.
- Se retiró físicamente el comando heredado `usage.ts` y se agregó un script de
  limpieza para instalaciones actualizadas mediante copia de ZIP.
- Se agregó un contexto maestro autosuficiente para reconstruir el estado del
  proyecto en otra conversación.

# Pendientes

- Confirmar el botón y ejecutar la primera release desde la rama predeterminada.
- En un refactor posterior, eliminar físicamente módulos comerciales muertos si
  el typecheck y las pruebas confirman que ningún paquete compartido los usa.

# Próximos pasos

1. Copiar el proyecto actualizado.
2. Ejecutar typecheck y pruebas del CLI.
3. Confirmar el commit en la rama predeterminada.
4. Abrir Actions y ejecutar el workflow manual.
5. Verificar que la paleta `/` no muestre comandos comerciales.
