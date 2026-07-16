#!/usr/bin/env sh
set -eu

REPOSITORY="${CODEWOLF_REPOSITORY:-YahirHub/codewolf}"
BIN_DIR="${CODEWOLF_BIN_DIR:-$HOME/.local/bin}"
SHARE_DIR="${CODEWOLF_SHARE_DIR:-$HOME/.local/share/codewolf}"
CONFIG_DIR="${CODEWOLF_CONFIG_DIR:-$HOME/.codewolf}"
BACKUP_DIR="${CODEWOLF_BACKUP_DIR:-$HOME/.codewolf-backups}"
BASELINE_MODE="${CODEWOLF_BASELINE:-auto}"

log() {
  printf '%s\n' "[codewolf] $*"
}

fail() {
  printf '%s\n' "[codewolf] Error: $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

download_file() {
  url="$1"
  destination="$2"
  if command_exists curl; then
    curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 \
      -o "$destination" "$url"
  elif command_exists wget; then
    wget -q --tries=3 --timeout=20 -O "$destination" "$url"
  else
    fail 'Se requiere curl o wget para descargar la release.'
  fi
}

sha256_file() {
  file="$1"
  if command_exists sha256sum; then
    sha256sum "$file" | awk '{print $1}'
  elif command_exists shasum; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    fail 'Se requiere sha256sum o shasum para verificar la descarga.'
  fi
}

supports_avx2() {
  case "$platform" in
    linux)
      if [ -r /proc/cpuinfo ]; then
        grep -qiE '(^|[[:space:]])avx2([[:space:]]|$)' /proc/cpuinfo
        return $?
      fi
      ;;
    darwin)
      if command_exists sysctl; then
        sysctl -a 2>/dev/null | grep -qi 'AVX2'
        return $?
      fi
      ;;
    windows)
      if command_exists powershell.exe; then
        result="$(powershell.exe -NoProfile -NonInteractive -Command '[System.Runtime.Intrinsics.X86.Avx2]::IsSupported' 2>/dev/null | tr -d '\r' | tail -n 1 || true)"
        [ "$result" = 'True' ] && return 0
        [ "$result" = 'False' ] && return 1
      fi
      if [ -r /proc/cpuinfo ]; then
        grep -qiE '(^|[[:space:]])avx2([[:space:]]|$)' /proc/cpuinfo
        return $?
      fi
      ;;
  esac
  return 1
}

is_musl_linux() {
  [ -f /etc/alpine-release ] && return 0
  if command_exists ldd; then
    ldd --version 2>&1 | grep -qi musl && return 0
  fi
  return 1
}

add_path_block() {
  rc_file="$1"
  [ -n "$rc_file" ] || return 0
  marker='# >>> codewolf installer >>>'
  if [ -f "$rc_file" ] && grep -Fq "$marker" "$rc_file"; then
    return 0
  fi

  mkdir -p "$(dirname "$rc_file")"
  {
    printf '\n%s\n' "$marker"
    if [ "$BIN_DIR" = "$HOME/.local/bin" ]; then
      printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"'
    else
      printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
    fi
    printf '%s\n' '# <<< codewolf installer <<<'
  } >> "$rc_file"
  log "PATH agregado a $rc_file"
}

backup_existing_config() {
  [ "$is_update" = 'true' ] || return 0
  [ -d "$CONFIG_DIR" ] || return 0
  if [ -z "$(find "$CONFIG_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    return 0
  fi
  command_exists tar || fail 'Se requiere tar para respaldar la configuración anterior.'

  mkdir -p "$BACKUP_DIR"
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  backup_file="$BACKUP_DIR/codewolf-config-$timestamp.tar.gz"
  config_parent="$(dirname "$CONFIG_DIR")"
  config_name="$(basename "$CONFIG_DIR")"
  tar -C "$config_parent" -czf "$backup_file" "$config_name"
  log "Respaldo creado: $backup_file"
}

install_atomic() {
  source_file="$1"
  destination="$2"
  mode="$3"
  temp_destination="${destination}.tmp.$$"
  cp "$source_file" "$temp_destination"
  chmod "$mode" "$temp_destination"
  mv -f "$temp_destination" "$destination"
}

uname_s="$(uname -s 2>/dev/null || true)"
uname_m="$(uname -m 2>/dev/null || true)"

case "$uname_s" in
  Linux*) platform='linux' ;;
  Darwin*) platform='darwin' ;;
  MINGW*|MSYS*|CYGWIN*) platform='windows' ;;
  *) fail "Sistema operativo no compatible: ${uname_s:-desconocido}" ;;
esac

case "$uname_m" in
  x86_64|amd64|AMD64) architecture='x64' ;;
  arm64|aarch64|ARM64) architecture='arm64' ;;
  *) fail "Arquitectura no compatible: ${uname_m:-desconocida}" ;;
esac

baseline_suffix=''
if [ "$architecture" = 'x64' ]; then
  case "$BASELINE_MODE" in
    1|true|yes) baseline_suffix='-baseline' ;;
    0|false|no) baseline_suffix='' ;;
    auto)
      if supports_avx2; then
        baseline_suffix=''
      else
        baseline_suffix='-baseline'
      fi
      ;;
    *) fail 'CODEWOLF_BASELINE debe ser auto, 1 o 0.' ;;
  esac
fi

libc_suffix=''
if [ "$platform" = 'linux' ] && is_musl_linux; then
  libc_suffix='-musl'
fi

case "$platform" in
  linux)
    asset_target="linux-$architecture$libc_suffix$baseline_suffix"
    archive_extension='tar.gz'
    binary_name='codewolf'
    ;;
  darwin)
    asset_target="darwin-$architecture$baseline_suffix"
    archive_extension='tar.gz'
    binary_name='codewolf'
    ;;
  windows)
    asset_target="windows-$architecture$baseline_suffix"
    archive_extension='zip'
    binary_name='codewolf.exe'
    ;;
esac

asset_file="codewolf-$asset_target.$archive_extension"
release_base="https://github.com/$REPOSITORY/releases/latest/download"
asset_url="$release_base/$asset_file"
checksums_url="$release_base/SHA256SUMS.txt"

installed_path=''
if command_exists codewolf; then
  installed_path="$(command -v codewolf)"
elif [ -f "$BIN_DIR/$binary_name" ]; then
  installed_path="$BIN_DIR/$binary_name"
fi

if [ -n "$installed_path" ]; then
  is_update='true'
  log "Instalación existente detectada en $installed_path; se actualizará a latest."
else
  is_update='false'
  log 'No se detectó una instalación anterior; se realizará una instalación nueva.'
fi

backup_existing_config

temp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t codewolf)"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT HUP INT TERM

log "Descargando $asset_file desde $REPOSITORY..."
download_file "$asset_url" "$temp_dir/$asset_file"
download_file "$checksums_url" "$temp_dir/SHA256SUMS.txt"

expected_hash="$(awk -v asset="$asset_file" '{ name=$2; sub(/^\*/, "", name); if (name == asset) { print $1; exit } }' "$temp_dir/SHA256SUMS.txt")"
[ -n "$expected_hash" ] || fail "SHA-256 no encontrado para $asset_file."
actual_hash="$(sha256_file "$temp_dir/$asset_file")"
[ "$actual_hash" = "$expected_hash" ] || fail "La suma SHA-256 de $asset_file no coincide."
log 'Integridad SHA-256 verificada.'

extract_dir="$temp_dir/extracted"
mkdir -p "$extract_dir"
if [ "$archive_extension" = 'zip' ]; then
  if command_exists unzip; then
    unzip -q "$temp_dir/$asset_file" -d "$extract_dir"
  elif command_exists tar; then
    tar -xf "$temp_dir/$asset_file" -C "$extract_dir"
  else
    fail 'Se requiere unzip o tar para extraer el paquete de Windows.'
  fi
else
  command_exists tar || fail 'Se requiere tar para extraer el paquete.'
  tar -xzf "$temp_dir/$asset_file" -C "$extract_dir"
fi

[ -f "$extract_dir/$binary_name" ] || fail "El paquete no contiene $binary_name."
[ -f "$extract_dir/tree-sitter.wasm" ] || fail 'El paquete no contiene tree-sitter.wasm.'
[ -f "$extract_dir/LICENSE" ] || fail 'El paquete no contiene LICENSE.'
[ -f "$extract_dir/NOTICE" ] || fail 'El paquete no contiene NOTICE.'

mkdir -p "$BIN_DIR" "$SHARE_DIR"
install_atomic "$extract_dir/$binary_name" "$BIN_DIR/$binary_name" 755
install_atomic "$extract_dir/tree-sitter.wasm" "$BIN_DIR/tree-sitter.wasm" 644
install_atomic "$extract_dir/LICENSE" "$SHARE_DIR/LICENSE" 644
install_atomic "$extract_dir/NOTICE" "$SHARE_DIR/NOTICE" 644
if [ -f "$extract_dir/README.md" ]; then
  install_atomic "$extract_dir/README.md" "$SHARE_DIR/README.md" 644
fi

add_path_block "$HOME/.bashrc"
case "${SHELL:-}" in
  */zsh) add_path_block "$HOME/.zshrc" ;;
  */fish)
    log 'Fish detectado: agrega ~/.local/bin a fish_user_paths si no usas Bash.'
    ;;
esac

if [ "$is_update" = 'true' ]; then
  log "Codewolf actualizado correctamente: $BIN_DIR/$binary_name"
else
  log "Codewolf instalado correctamente: $BIN_DIR/$binary_name"
fi
log 'Abre una terminal nueva o ejecuta: source ~/.bashrc'
log 'Después inicia Codewolf con: codewolf'
