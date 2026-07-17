# 044 — Corrección de confirmación de contraseña de la bóveda SSH

## Fecha

2026-07-17

## Objetivo

Corregir el falso mensaje «Las contraseñas no coinciden» al crear o cambiar la contraseña maestra de la bóveda SSH, aunque ambas entradas fueran visualmente iguales.

## Causa

`SecretPromptScreen` comparaba los valores almacenados en el estado renderizado de React. `MultilineInput` entrega cada cambio de forma síncrona, pero React puede diferir el render. Al escribir o pegar la contraseña y pulsar Enter inmediatamente, la comparación podía usar una versión anterior de una de las entradas.

## Solución

- Se añadieron referencias síncronas independientes para la contraseña principal y su confirmación.
- Cada `onChange` actualiza primero la referencia y después el estado visual.
- La validación, comparación y envío leen siempre las referencias actuales.
- Los reinicios, errores de confirmación y cambios de solicitud limpian tanto el estado como las referencias.
- Se conserva la entrada enmascarada y ningún secreto se añade al chat, resultados o registros.

## Archivo modificado

- `cli/src/components/secret-prompt-screen.tsx`

## Validación

- El archivo TSX se transpila sin diagnósticos sintácticos.
- Se verificó estáticamente que la comparación ya no depende de `primary.text` o `confirmation.text` capturados por un render anterior.
- Queda pendiente ejecutar en Windows la prueba manual del flujo y la suite completa con Bun.

## Prueba manual

1. Eliminar o respaldar `~/.codewolf/ssh-secrets.enc` si se desea recrear la bóveda.
2. Solicitar guardar una contraseña SSH.
3. Escribir la misma contraseña maestra dos veces y pulsar Enter inmediatamente tras el último carácter.
4. Confirmar que la bóveda se crea sin mostrar el falso error.
5. Reiniciar Codewolf y comprobar que la misma contraseña maestra desbloquea la bóveda.
