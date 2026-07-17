# 026 — Generar contexto conciso sin llamadas adicionales

# Fecha

2026-07-15

# Objetivo

Evitar que los registros automáticos de `contexto/` copien solicitudes largas, respuestas completas o texto de relleno, y reducir el consumo de tokens del mantenimiento documental.

# Decisiones tomadas

- Los registros posteriores a implementaciones normales se generan localmente y no realizan una llamada adicional al proveedor.
- `/init` conserva una única llamada estructurada opcional porque requiere un análisis general del proyecto; siempre dispone de un resultado local si falla.
- El título local es la fuente de verdad, tiene un máximo de 72 caracteres y se transforma en un slug de hasta 52 caracteres.
- Las secciones sin información confirmada se omiten en vez de completarse con frases genéricas.

# Arquitectura actual

- `cli/src/utils/project-context-maintenance.ts` deriva el objetivo desde la solicitud, extrae viñetas técnicas de la salida final, filtra metatexto y escribe el registro numerado.
- Los archivos automáticos incluyen un marcador HTML para distinguir su procedencia sin afectar el renderizado Markdown.
- El contexto maestro continúa actualizándose dentro de su sección delimitada sin reemplazar contenido manual.

# Librerías usadas

- No se agregaron dependencias; se utilizan expresiones regulares y APIs estándar de Node.js.

# Archivos importantes modificados

- `cli/src/utils/project-context-maintenance.ts`
- `cli/src/utils/__tests__/project-context-maintenance.test.ts`
- `cli/src/utils/development-methodology.ts`
- `docs/project-methodology.md`
- `docs/metodologia-desarrollo-universal.md`
- `README.md`
- `AGENTS.md`
- `contexto/000-contexto-maestro.md`

# Problemas encontrados

- El fallback anterior usaba la primera línea de la solicitud como título y podía crear nombres de archivo extensos o poco técnicos.
- `summarizeRunState` podía terminar pegando toda la entrega del agente dentro de `Soluciones implementadas`.
- Las secciones vacías se rellenaban con frases que no aportaban memoria técnica.
- El agente documental añadía una llamada al modelo después de cada implementación aunque la información necesaria ya estaba disponible localmente.

# Soluciones implementadas

- Se añadió generación local de títulos técnicos, objetivos y resúmenes a partir de evidencia del turno.
- Se filtran encabezados, tablas, frases conversacionales, referencias a asistentes y líneas genéricas.
- Se extraen únicamente viñetas técnicas breves y se limitan su longitud y cantidad.
- Se preservan identificadores y rutas con guiones bajos.
- Se renderizan siempre las secciones esenciales y solo se incluyen apartados opcionales cuando contienen hechos confirmados.
- Se agregó una prueba con el caso de detención de escaneo para verificar el nombre `permitir-detener-el-escaneo-activo` y la ausencia de contenido copiado.

# Pendientes

- Ejecutar la suite de Bun en un entorno con las dependencias del monorepo instaladas.

# Próximos pasos

- Probar una implementación real con contexto persistente activo y revisar el documento numerado generado.
