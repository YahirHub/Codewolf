# Cambio: CLI sin archivo `.env`

## Objetivo

Permitir que Codebuff/Codewolf se ejecute y se compile como CLI independiente sin exigir variables `NEXT_PUBLIC_*` ni un archivo `.env`, especialmente cuando se trabaja exclusivamente con proveedores personalizados.

## Implementación

- Se agregó un preload exclusivo del CLI que completa valores públicos faltantes antes de importar agentes, SDK o componentes.
- `bun run dev` y `prebuild:agents` cargan automáticamente esos valores internos.
- La compilación binaria aplica valores de producción seguros antes de generar agentes, compilar el SDK y empaquetar el ejecutable.
- Una variable definida explícitamente por el usuario conserva prioridad y nunca es sobrescrita.
- PostHog queda desactivado mediante el valor centinela `disabled`; en ese modo la analítica es completamente no-op y no genera errores ni conexiones.
- Stripe y los valores del sitio quedan únicamente como compatibilidad para módulos heredados; no son necesarios para usar proveedores personalizados.

## Flujo vigente

1. Instalar dependencias con `bun install --frozen-lockfile`.
2. Ejecutar `bun run dev` sin crear `.env`.
3. Abrir `/login` para registrar el proveedor personalizado.
4. Usar `/models` para seleccionar proveedor y modelo.

## Archivos principales

- `cli/scripts/cli-env-defaults.ts`
- `cli/scripts/preload-cli-env.ts`
- `cli/scripts/build-binary.ts`
- `cli/package.json`
- `cli/src/utils/analytics.ts`
- `cli/scripts/__tests__/cli-env-defaults.test.ts`
