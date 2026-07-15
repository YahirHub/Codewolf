export type ToolPermissionCategory =
  'command' | 'file-create' | 'file-edit' | 'file-delete' | 'external-tool'

export type ToolPermissionDecision = 'allow' | 'deny'

export type ToolPermissionRequest = {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  agentId: string
  parentAgentId?: string
  category: ToolPermissionCategory
  title: string
  target?: string
  reason: string
  preview?: string
}

export type ToolPermissionResponse = {
  decision: ToolPermissionDecision
  message?: string
}

export type RequestToolPermissionFn = (
  request: ToolPermissionRequest,
) => Promise<ToolPermissionResponse>
