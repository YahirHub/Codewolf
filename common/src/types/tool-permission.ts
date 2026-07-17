export type ToolPermissionCategory =
  | 'command'
  | 'file-read'
  | 'file-create'
  | 'file-edit'
  | 'file-delete'
  | 'external-tool'
  | 'remote-connect'
  | 'remote-command'
  | 'remote-transfer'
  | 'remote-file'

export type ToolPermissionDecision = 'allow' | 'deny'

export type ToolPermissionScope = 'local' | 'ssh' | 'external'

export type ToolPermissionRequest = {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  agentId: string
  parentAgentId?: string
  category: ToolPermissionCategory
  scope?: ToolPermissionScope
  operation?: string
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

export type ToolPermissionPolicy = {
  /** Protect local mutations, commands, MCP, and custom external tools. */
  safeModeEnabled?: boolean
  /** Protect SSH connections and every remote action except reading/navigation. */
  sshSafeModeEnabled?: boolean
  /** Require permission before reading the contents of .env and .env.* files. */
  protectEnvFiles?: boolean
}
