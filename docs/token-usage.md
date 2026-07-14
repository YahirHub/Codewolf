# Estadísticas locales de tokens

## Objetivo

`/usage` permite inspeccionar el volumen de tokens procesados por Codewolf sin
depender de funciones comerciales ni de que todos los proveedores entreguen un
objeto `usage`. No calcula costos, créditos, saldos ni cuotas.

## Fuentes de medición

Cada llamada se clasifica como:

- `provider`: el proveedor informó tokens de entrada y salida.
- `mixed`: el proveedor informó solo una parte y Codewolf calculó el resto.
- `local`: Codewolf calculó entrada y salida porque el proveedor no informó uso.

La entrada local se calcula sobre el cuerpo normalizado realmente enviado al
modelo, incluyendo historial y definiciones de herramientas. Los `data:` URL se
resumen antes del conteo y el evento se marca como multimedia para dejar claro
que esa parte es aproximada. La salida local incluye texto, razonamiento visible
y argumentos de llamadas a herramientas.

## Persistencia

Los eventos se agregan a:

```text
~/.codewolf/usage.jsonl
```

Cada línea contiene únicamente:

- fecha y sesión;
- proyecto;
- proveedor y modelo;
- agente o subagente;
- tokens de entrada, salida, caché y total;
- origen de la medición;
- estado y duración.

Nunca se guardan prompts, respuestas, contenido de archivos, resultados de
herramientas, imágenes ni claves. El archivo se compacta al superar 4 MiB y
conserva como máximo 90 días o 10 000 eventos.

## Interfaz

```text
/usage
```

Muestra:

- sesión actual;
- proyecto actual;
- acumulado local;
- última llamada y origen de medición;
- desglose por agente en la sesión;
- desglose por proveedor/modelo en el proyecto.

Controles:

```text
↑/↓ y RePág/AvPág  Desplazarse
R                   Solicitar limpieza total
Enter               Confirmar limpieza
Esc                  Cancelar o cerrar
```

## Integración

El SDK recibe un callback `onTokenUsage`. El límite común de LLM registra todas
las llamadas de texto en streaming, texto no streaming y salida estructurada. El
CLI solo persiste el evento normalizado; no vuelve a contar el contenido.

La persistencia es de mejor esfuerzo: un error al guardar estadísticas nunca
debe interrumpir una solicitud al modelo.
