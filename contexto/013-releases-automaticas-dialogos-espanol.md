# 013 — Releases automáticas y diálogos del CLI en español

## Objetivo

Hacer que GitHub Actions publique binarios de Codewolf únicamente mediante una
ejecución manual, sin etiquetas con prefijo `v`, y traducir al español todos
los textos visibles de la interfaz del CLI sin alterar contratos internos.

## Workflow

- Archivo: `.github/workflows/build-binaries.yml`.
- Activador único: `workflow_dispatch`.
- Primera versión: `1.0.0`.
- Versiones siguientes: se ordenan las etiquetas estrictamente numéricas y se
  incrementa el parche de la más reciente.
- Formato permitido: `X.Y.Z`; no se genera ni se interpreta `vX.Y.Z`.
- La etiqueta y la release se crean después de validar Linux y Windows.
- Un solo runner `ubuntu-latest` instala dependencias una vez, compila Linux y
  realiza cross-build de Windows.
- El grupo de concurrencia `codewolf-release` serializa publicaciones para que
  dos ejecuciones no calculen la misma versión.

## Visibilidad del botón manual

GitHub muestra **Run workflow** únicamente cuando el archivo ya está confirmado
y subido a la rama predeterminada y Actions está habilitado. El token del
workflow requiere permisos `contents: write` para crear etiquetas y releases.

## Traducción del CLI

Se traducen únicamente textos visibles: pantallas, menús, estados, ayudas,
avisos, errores, botones, formularios, historial y mensajes de diagnóstico.

No se traducen:

- comandos y alias (`/login`, `/models`, `/setup-search`);
- flags del ejecutable;
- IDs de agentes y herramientas;
- nombres de campos y valores de protocolo;
- claves de entorno;
- prompts internos destinados a los modelos.

Esta separación evita romper comparaciones, serialización, pruebas y
compatibilidad con proveedores o agentes existentes.
