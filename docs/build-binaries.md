# Compilar y publicar binarios de Codewolf

## Compilación local

Desde la raíz del repositorio:

```bash
bun install --frozen-lockfile
bun run build:binary
```

El sistema operativo actual determina la salida:

- Windows: `cli/bin/codewolf.exe`
- Linux/macOS: `cli/bin/codewolf`
- Archivo complementario obligatorio: `cli/bin/tree-sitter.wasm`

Mantén `tree-sitter.wasm` en la misma carpeta que el ejecutable.

## Ejecución manual en GitHub Actions

El workflow está ubicado en:

```text
.github/workflows/build-binaries.yml
```

Solo utiliza `workflow_dispatch`; por tanto, no consume minutos con cada push,
pull request o etiqueta.

Para que aparezca el botón **Run workflow**:

1. Confirma y sube el archivo del workflow a la rama predeterminada del repositorio.
2. Comprueba que GitHub Actions esté habilitado en **Settings → Actions → General**.
3. Abre **Actions → Compilar binarios y publicar release**.
4. Pulsa **Run workflow** y confirma la rama que quieres publicar.

GitHub solo muestra el botón manual cuando la definición del workflow ya existe
en la rama predeterminada. Tener el archivo únicamente en tu computadora o en
una rama todavía no fusionada no es suficiente.

## Versionado automático

No se solicita una versión al usuario. El workflow revisa todas las etiquetas
que cumplan exactamente este formato:

```text
<mayor>.<menor>.<parche>
```

Si no existe ninguna, crea:

```text
1.0.0
```

Después incrementa siempre el último segmento de la etiqueta numérica más
reciente:

```text
1.0.0 → 1.0.1 → 1.0.2
2.4.9 → 2.4.10
```

Las etiquetas como `v1.0.0`, nombres de ramas u otros textos se ignoran. Tanto
la etiqueta como el título de la release contienen únicamente números y puntos.
La etiqueta y la release se crean solo después de que las compilaciones y sus
verificaciones terminan correctamente.

## Archivos de cada release

La release recibe estos archivos:

```text
codewolf-linux-x64.tar.gz
codewolf-windows-x64.zip
SHA256SUMS.txt
```

El TAR de Linux conserva el permiso ejecutable. El ZIP de Windows contiene
`codewolf.exe` y `tree-sitter.wasm`.

## Optimización de minutos

El workflow usa un solo job en `ubuntu-latest`:

- Instala Bun y las dependencias una sola vez.
- Restaura la caché del gestor de paquetes.
- Genera los agentes y compila el SDK una sola vez.
- Compila Linux de forma nativa.
- Compila Windows x64 mediante cross-compilation de Bun.
- Publica directamente en GitHub Releases, sin un segundo job de subida.
- Limita la ejecución completa a 20 minutos.
- Serializa las publicaciones mediante el grupo de concurrencia
  `codewolf-release`, evitando que dos ejecuciones calculen la misma versión.

El workflow necesita permisos de escritura sobre el contenido del repositorio
para crear la etiqueta y la release. La definición ya declara
`permissions: contents: write`. Si una política del repositorio u organización
lo impide, habilita **Read and write permissions** en
**Settings → Actions → General → Workflow permissions**.

## Ejecución manual y botón de GitHub

El workflow usa exclusivamente `workflow_dispatch`. GitHub muestra **Run workflow** únicamente cuando:

- `.github/workflows/build-binaries.yml` está confirmado en la rama
  predeterminada;
- GitHub Actions está habilitado en **Settings → Actions → General**;
- la cuenta tiene permisos de escritura;
- el workflow no está deshabilitado.

Comando alternativo:

```bash
gh workflow run build-binaries.yml --ref main
```

Para revisar si GitHub reconoce el archivo:

```bash
gh workflow list
gh workflow view build-binaries.yml
```

La ejecución manual calcula la versión automáticamente; no acepta una versión
escrita por el usuario.
