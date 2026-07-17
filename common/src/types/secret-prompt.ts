export type SecretPromptKind =
  | 'vault-master-password'
  | 'vault-master-password-create'
  | 'vault-master-password-change'
  | 'ssh-password'
  | 'ssh-passphrase'

export type SecretPromptRequest = {
  requestId: string
  kind: SecretPromptKind
  title: string
  message: string
  serverName?: string
  confirm?: boolean
  minLength?: number
  attempt?: number
  maxAttempts?: number
}

export type SecretPromptResponse = {
  value?: string
  cancelled?: boolean
}

export type RequestSecretFn = (
  request: SecretPromptRequest,
  signal?: AbortSignal,
) => Promise<SecretPromptResponse>
