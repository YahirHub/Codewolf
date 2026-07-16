# 036 — Onboarding visual y branding animado reutilizable

# Fecha

2026-07-15

# Objetivo

Mejorar la primera pantalla de Codewolf para que deje de ser un bloque de texto plano, conserve la atribución legal y permita elegir el método inicial de conexión con una jerarquía visual clara.

# Archivos importantes modificados

- `cli/src/components/animated-codewolf-logo.tsx`
- `cli/src/components/first-run-onboarding-screen.tsx`
- `cli/src/components/chat-header.tsx`
- `README.md`
- `AGENTS.md`
- `contexto/000-contexto-maestro.md`

# Soluciones implementadas

- Se creó `AnimatedCodewolfLogo`, un componente reutilizable que encapsula el logotipo, los colores del tema y la animación de brillo.
- En terminales amplias muestra el logotipo ASCII animado; cuando falta ancho o altura cambia automáticamente al texto `CODEWOLF` animado.
- El encabezado del chat reutiliza el nuevo componente y deja de duplicar la configuración de animación.
- El onboarding ahora utiliza un panel centrado, título de configuración inicial, mensaje introductorio, indicador de paso y tres tarjetas seleccionables.
- Cada tarjeta muestra tipo de acceso, estado visual de selección y una descripción contextual de la opción activa.
- La interfaz reduce espacios, explicaciones y elementos secundarios según la altura disponible para mantenerse utilizable en una terminal estándar de 80x24.
- Se mantienen las tres rutas funcionales existentes: Codex Subscription, proveedor personalizado y OpenCode Free.
- La atribución a YahirHub, Codebuff y Apache-2.0 continúa visible sin alterar `LICENSE` ni `NOTICE`.

# Decisiones tomadas

- No se cambió la lógica de detección ni finalización del onboarding; el cambio es visual y de reutilización de componentes.
- No se agregaron imágenes externas ni dependencias nuevas: todo se renderiza con OpenTUI y los recursos de tema existentes.
- El texto completo de licencia se oculta únicamente en terminales cortas; la atribución principal se conserva siempre que exista altura suficiente.

# Validación

- Se validó sintácticamente el TSX modificado mediante `transpileModule` de TypeScript.
- Se comprobó que el componente nuevo es utilizado tanto por el onboarding como por el encabezado del chat.
- Pendiente ejecutar en el entorno del usuario:
  - `bun run --cwd ./cli typecheck`
  - `bun run build:binary`
  - prueba visual en terminales 80x24 y de mayor altura.

# Riesgos

- La medición final de filas depende del renderizador y de la fuente de la terminal; por eso los elementos secundarios se habilitan con umbrales conservadores.
- Terminales extremadamente pequeñas pueden ocultar la descripción seleccionada y la línea extendida de licencia, pero conservan las opciones y controles de teclado.
