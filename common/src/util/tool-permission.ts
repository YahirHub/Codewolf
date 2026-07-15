import type {
  ToolPermissionCategory,
  ToolPermissionRequest,
} from '../types/tool-permission'

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

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function redactPreviewValue(
  value: unknown,
  key: string | undefined,
  depth: number,
): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return '[oculto]'
  if (depth > 3) return '[contenido anidado]'

  if (typeof value === 'string') {
    if (value.length <= MAX_STRING_LENGTH) return value
    return `${value.slice(0, MAX_STRING_LENGTH)}…`
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

  if (toolName === 'run_terminal_command') {
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

  return {
    toolCallId,
    toolName,
    input,
    agentId,
    ...(parentAgentId ? { parentAgentId } : {}),
    category,
    title,
    ...(target ? { target } : {}),
    reason,
    ...(preview ? { preview } : {}),
  }
}
