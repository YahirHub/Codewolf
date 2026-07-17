import type {
  ToolPermissionCategory,
  ToolPermissionRequest,
} from '../types/tool-permission'
import type { SshRemoteAction } from '../tools/params/tool/ssh-remote'

const SENSITIVE_NATIVE_TOOLS = new Set([
  'apply_patch',
  'run_file_change_hooks',
  'run_terminal_command',
  'str_replace',
  'write_file',
])

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|credential|password|passwd|secret|token|api[_-]?key|private[_-]?key)/i
const MAX_PREVIEW_LENGTH = 1_200
const MAX_STRING_LENGTH = 360

const SENSITIVE_ASSIGNMENT_NAME = String.raw`\b[A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|AUTHORIZATION)[A-Za-z0-9_]*\b`

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
      (_match, label: string) =>
        `-----BEGIN ${label}-----\n[oculto]\n-----END ${label}-----`,
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[oculto]')
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[oculto]@')
    .replace(
      new RegExp(
        `(${SENSITIVE_ASSIGNMENT_NAME}\\s*[:=]\\s*)(["'])[^"']*\\2`,
        'gi',
      ),
      '$1$2[oculto]$2',
    )
    .replace(
      new RegExp(`(${SENSITIVE_ASSIGNMENT_NAME}\\s*[:=]\\s*)[^\\s,;]+`, 'gi'),
      '$1[oculto]',
    )
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? redactSensitiveText(value.trim())
    : undefined
}

function redactPreviewValue(
  value: unknown,
  key: string | undefined,
  depth: number,
): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return '[oculto]'
  if (depth > 3) return '[contenido anidado]'

  if (typeof value === 'string') {
    const redacted = redactSensitiveText(value)
    if (redacted.length <= MAX_STRING_LENGTH) return redacted
    return `${redacted.slice(0, MAX_STRING_LENGTH)}…`
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 10)
      .map((entry) => redactPreviewValue(entry, undefined, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([entryKey]) =>
            !['content', 'diff', 'oldString', 'newString'].includes(entryKey),
        )
        .slice(0, 20)
        .map(([entryKey, entryValue]) => [
          entryKey,
          redactPreviewValue(entryValue, entryKey, depth + 1),
        ]),
    )
  }
  return String(value)
}

function externalPreview(input: Record<string, unknown>): string | undefined {
  const safe = redactPreviewValue(input, undefined, 0)
  const serialized = JSON.stringify(safe, null, 2)
  if (!serialized || serialized === '{}') return undefined
  return serialized.length <= MAX_PREVIEW_LENGTH
    ? serialized
    : `${serialized.slice(0, MAX_PREVIEW_LENGTH)}\n…`
}

export function shouldRequestToolPermission(params: {
  toolName: string
  externalTool?: boolean
}): boolean {
  return (
    params.externalTool === true ||
    SENSITIVE_NATIVE_TOOLS.has(params.toolName) ||
    params.toolName.startsWith('composio_')
  )
}

const SSH_ACTION_DETAILS: Record<
  SshRemoteAction,
  { category: ToolPermissionCategory; title: string }
> = {
  connect: { category: 'remote-connect', title: 'Abrir conexión SSH' },
  list_connections: { category: 'remote-file', title: 'Listar conexiones SSH' },
  status: { category: 'remote-file', title: 'Consultar conexión SSH' },
  pwd: { category: 'remote-file', title: 'Consultar directorio remoto' },
  cd: { category: 'remote-file', title: 'Navegar en servidor remoto' },
  list: { category: 'remote-file', title: 'Listar archivos remotos' },
  stat: { category: 'remote-file', title: 'Consultar archivo remoto' },
  read_file: { category: 'file-read', title: 'Leer archivo remoto protegido' },
  exec: { category: 'remote-command', title: 'Ejecutar comando remoto' },
  shell_open: {
    category: 'remote-command',
    title: 'Abrir shell SSH persistente',
  },
  shell_write: { category: 'remote-command', title: 'Escribir en shell SSH' },
  shell_read: { category: 'remote-command', title: 'Leer salida de shell SSH' },
  upload: { category: 'remote-transfer', title: 'Subir archivo al servidor' },
  download: {
    category: 'remote-transfer',
    title: 'Descargar archivo del servidor',
  },
  write_file: { category: 'remote-file', title: 'Escribir archivo remoto' },
  mkdir: { category: 'remote-file', title: 'Crear directorio remoto' },
  rename: { category: 'remote-file', title: 'Renombrar archivo remoto' },
  delete: { category: 'file-delete', title: 'Eliminar archivo remoto' },
  close: { category: 'remote-connect', title: 'Cerrar conexión SSH' },
  close_all: { category: 'remote-connect', title: 'Cerrar conexiones SSH' },
}

export function createEnvReadPermissionRequest(params: {
  toolCallId: string
  toolName: string
  filePath: string
  agentId?: string
  parentAgentId?: string
  scope?: 'local' | 'ssh'
}): ToolPermissionRequest {
  return {
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    input: { path: params.filePath },
    agentId: params.agentId ?? 'agente actual',
    ...(params.parentAgentId ? { parentAgentId: params.parentAgentId } : {}),
    category: 'file-read',
    scope: params.scope ?? 'local',
    operation: 'read_env',
    title: 'Leer variables de entorno protegidas',
    target: params.filePath,
    reason:
      'El archivo puede contener contraseñas, tokens u otras credenciales. Se requiere autorización explícita para mostrar su contenido.',
  }
}

export function createToolPermissionRequest(params: {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  agentId: string
  parentAgentId?: string
  externalTool?: boolean
}): ToolPermissionRequest {
  const { toolCallId, toolName, input, agentId, parentAgentId } = params
  const explicitReason = text(input.reason)

  let category: ToolPermissionCategory = 'external-tool'
  let title = 'Ejecutar herramienta externa'
  let target: string | undefined = toolName
  let reason =
    explicitReason ??
    text(input.purpose) ??
    text(input.description) ??
    text(input.instructions) ??
    'El modelo necesita usar esta herramienta externa para continuar.'
  let preview: string | undefined

  if (toolName === 'ssh_remote') {
    const action = text(input.action) as SshRemoteAction | undefined
    const details = action ? SSH_ACTION_DETAILS[action] : undefined
    category = details?.category ?? 'remote-file'
    title = details?.title ?? 'Operación SSH remota'
    const connectionTarget =
      text(input.connection_id) ||
      [text(input.username), text(input.host)].filter(Boolean).join('@')
    target = connectionTarget || toolName
    reason =
      explicitReason ??
      'El modelo necesita realizar esta operación en un servidor remoto para continuar.'
    preview = externalPreview(input)
  } else if (toolName === 'run_terminal_command') {
    category = 'command'
    title = 'Ejecutar comando'
    target = text(input.command)
    reason =
      explicitReason ??
      text(input.purpose) ??
      'El modelo necesita ejecutar este comando para continuar con la tarea.'
    const cwd = text(input.cwd)
    preview = cwd ? `Directorio de trabajo: ${cwd}` : undefined
  } else if (toolName === 'write_file') {
    category = 'file-create'
    title = 'Crear o sobrescribir archivo'
    target = text(input.path)
    reason =
      explicitReason ??
      text(input.instructions) ??
      'El modelo necesita escribir este archivo para implementar el cambio.'
  } else if (toolName === 'str_replace') {
    category = 'file-edit'
    title = 'Editar archivo'
    target = text(input.path)
    const replacementCount = Array.isArray(input.replacements)
      ? input.replacements.length
      : 0
    reason =
      explicitReason ??
      `El modelo solicita aplicar ${replacementCount || 'uno o más'} reemplazo${replacementCount === 1 ? '' : 's'} en este archivo.`
  } else if (toolName === 'apply_patch') {
    const operation =
      input.operation && typeof input.operation === 'object'
        ? (input.operation as Record<string, unknown>)
        : {}
    const operationType = text(operation.type)
    target = text(operation.path)
    category =
      operationType === 'create_file'
        ? 'file-create'
        : operationType === 'delete_file'
          ? 'file-delete'
          : 'file-edit'
    title =
      category === 'file-create'
        ? 'Crear archivo'
        : category === 'file-delete'
          ? 'Eliminar archivo'
          : 'Aplicar cambios a archivo'
    reason =
      explicitReason ??
      `El modelo necesita ${category === 'file-create' ? 'crear' : category === 'file-delete' ? 'eliminar' : 'modificar'} este archivo para continuar.`
  } else if (toolName === 'run_file_change_hooks') {
    category = 'command'
    title = 'Ejecutar hooks del proyecto'
    target = 'Hooks posteriores a cambios de archivos'
    reason =
      explicitReason ??
      'El modelo solicita ejecutar automatizaciones definidas por el proyecto.'
  } else {
    preview = externalPreview(input)
  }

  const safeInput = redactPreviewValue(input, undefined, 0) as Record<
    string,
    unknown
  >

  return {
    toolCallId,
    toolName,
    input: safeInput,
    agentId,
    ...(parentAgentId ? { parentAgentId } : {}),
    category,
    scope:
      toolName === 'ssh_remote'
        ? 'ssh'
        : params.externalTool
          ? 'external'
          : 'local',
    ...(toolName === 'ssh_remote' && text(input.action)
      ? { operation: text(input.action) }
      : {}),
    title,
    ...(target ? { target } : {}),
    reason,
    ...(preview ? { preview } : {}),
  }
}
