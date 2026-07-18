# GitZip interno de Codewolf

`gitzip` crea paquetes de despliegue sin incluir archivos descartados por Git.
Es una herramienta interna del agente, no un comando destinado al usuario final.

## Acciones

- `create`: crea ZIP, TAR o TAR.GZ localmente.
- `upload`: crea el paquete local, lo sube por una conexión persistente de
  `ssh_remote` y opcionalmente lo extrae.
- `remote_create`: recorre el proyecto remoto mediante SFTP, genera un
  manifiesto filtrado y ejecuta `tar` o `zip` en el servidor.
- `remote_extract`: extrae un archivo existente en el servidor.

## Reglas de exclusión

El recorrido aplica, en orden, las reglas de `.gitignore` de la raíz y de cada
subdirectorio. También admite `.codewolfignore` y los nombres heredados
`.codebuffignore` y `.manicodeignore`.

Siempre se excluyen:

- `.git/`;
- el archivo de salida actual;
- manifiestos temporales;
- `.env` y variantes protegidas, salvo autorización explícita mediante
  `include_protected_env=true`.

`extra_excludes` acepta patrones adicionales con sintaxis de `.gitignore`.
Las carpetas vacías y enlaces simbólicos se conservan cuando el formato lo
permite.

## Ejemplos internos

Crear un ZIP local:

```json
{
  "action": "create",
  "source_path": ".",
  "output_path": "release/app.zip",
  "overwrite": true
}
```

Subir y extraer en un servidor ya conectado:

```json
{
  "action": "upload",
  "source_path": ".",
  "format": "tar.gz",
  "connection_id": "ssh://production-1",
  "remote_path": "/opt/releases/app.tar.gz",
  "extract_remote": true,
  "extract_path": "/opt/apps/app",
  "overwrite": true,
  "cleanup_local": true
}
```

Crear el paquete directamente en el servidor:

```json
{
  "action": "remote_create",
  "source_path": "/srv/app",
  "output_path": "/srv/releases/app.tar.gz",
  "format": "tar.gz",
  "connection_id": "ssh://production-1",
  "overwrite": true
}
```

## Seguridad

- `create` usa el Modo seguro local.
- `upload`, `remote_create` y `remote_extract` usan el Modo seguro SSH.
- Incluir `.env` requiere una segunda autorización independiente cuando la
  protección está activa.
- En remoto nunca se pasa el directorio completo recursivamente a `tar` o
  `zip`: se genera primero un manifiesto explícito con las rutas permitidas.
- `archive_args` solo acepta una lista conservadora de opciones de metadatos o
  compresión. No puede sustituir el manifiesto, añadir archivos arbitrarios,
  activar recursión ni ejecutar comandos auxiliares.
