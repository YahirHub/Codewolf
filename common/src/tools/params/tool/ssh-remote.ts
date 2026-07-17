import z from 'zod/v4'

import { jsonObjectSchema } from '../../../types/json'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const SSH_REMOTE_ACTIONS = [
  'connect',
  'connect_server',
  'list_servers',
  'get_server',
  'add_server',
  'update_server',
  'rename_server',
  'delete_server',
  'list_connections',
  'status',
  'pwd',
  'cd',
  'list',
  'stat',
  'read_file',
  'exec',
  'shell_open',
  'shell_write',
  'shell_read',
  'upload',
  'download',
  'write_file',
  'mkdir',
  'rename',
  'delete',
  'close',
  'close_all',
] as const

export type SshRemoteAction = (typeof SSH_REMOTE_ACTIONS)[number]

const toolName = 'ssh_remote'
const endsAgentStep = true

const inputSchema = z
  .object({
    action: z.enum(SSH_REMOTE_ACTIONS),
    connection_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Active connection identifier returned by connect/connect_server, or its ssh:// reference.',
      ),
    server_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Configured server ID/ref, unique configured name, host, host:port, or username@host.',
      ),
    name: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Human-friendly persistent server name.'),
    label: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Legacy alias for name. Prefer name for new calls.'),
    new_name: z.string().min(1).max(80).optional(),
    clear_name: z.boolean().default(false).optional(),
    clear_authentication: z.boolean().default(false).optional(),
    close_connections: z.boolean().default(false).optional(),
    save_server: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'For direct connect, remember the non-secret server configuration globally. Defaults to true.',
      ),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).default(22).optional(),
    username: z.string().min(1).optional(),
    password: z
      .string()
      .optional()
      .describe(
        'Ephemeral SSH password. Never persisted. Prefer password_env.',
      ),
    password_env: z
      .string()
      .min(1)
      .optional()
      .describe('Environment variable containing the SSH password.'),
    private_key_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Path to an OpenSSH private key. Relative paths are made absolute before a server is saved.',
      ),
    private_key: z
      .string()
      .optional()
      .describe('Ephemeral private key contents. Never persisted.'),
    passphrase: z
      .string()
      .optional()
      .describe('Ephemeral private-key passphrase. Never persisted.'),
    passphrase_env: z.string().min(1).optional(),
    agent: z.string().optional().describe('SSH agent socket path.'),
    agent_env: z
      .string()
      .min(1)
      .optional()
      .describe('Environment variable containing the SSH agent socket path.'),
    host_fingerprint_sha256: z
      .string()
      .optional()
      .describe('Optional expected SHA-256 host-key fingerprint.'),
    ready_timeout_ms: z.number().int().min(1_000).max(120_000).optional(),
    keepalive_interval_ms: z.number().int().min(1_000).max(120_000).optional(),
    path: z.string().optional(),
    destination_path: z.string().optional(),
    local_path: z.string().optional(),
    remote_path: z.string().optional(),
    content: z.string().optional(),
    encoding: z.enum(['utf8', 'base64']).default('utf8').optional(),
    command: z.string().min(1).optional(),
    timeout_seconds: z.number().min(-1).max(86_400).default(30).optional(),
    pty: z.boolean().default(false).optional(),
    cols: z.number().int().min(20).max(500).default(120).optional(),
    rows: z.number().int().min(5).max(200).default(30).optional(),
    wait_ms: z.number().int().min(0).max(30_000).default(350).optional(),
    max_bytes: z
      .number()
      .int()
      .min(1)
      .max(10_485_760)
      .default(200_000)
      .optional(),
    recursive: z.boolean().default(false).optional(),
    overwrite: z.boolean().default(false).optional(),
    reason: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.action === 'connect') {
      if (!input.host) {
        ctx.addIssue({
          code: 'custom',
          path: ['host'],
          message: 'host is required for connect',
        })
      }
      if (!input.username) {
        ctx.addIssue({
          code: 'custom',
          path: ['username'],
          message: 'username is required for connect',
        })
      }
      const authCount = [
        input.password,
        input.password_env,
        input.private_key_path,
        input.private_key,
        input.agent,
        input.agent_env,
      ].filter(Boolean).length
      if (authCount === 0) {
        ctx.addIssue({
          code: 'custom',
          message:
            'connect requires password/password_env, private_key/private_key_path, agent/agent_env authentication',
        })
      }
    }

    if (
      input.action === 'connect_server' &&
      [input.name, input.label, input.host, input.port, input.username].some(
        (value) => value !== undefined,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'connect_server uses the saved name, host, port, and username. Use update_server to change them.',
      })
    }

    if (input.action === 'add_server') {
      if (!input.host) {
        ctx.addIssue({
          code: 'custom',
          path: ['host'],
          message: 'host is required for add_server',
        })
      }
      if (!input.username) {
        ctx.addIssue({
          code: 'custom',
          path: ['username'],
          message: 'username is required for add_server',
        })
      }
    }

    const serverReferenceActions = new Set([
      'connect_server',
      'get_server',
      'update_server',
      'rename_server',
      'delete_server',
    ])
    if (serverReferenceActions.has(input.action) && !input.server_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['server_id'],
        message: `server_id is required for ${input.action}`,
      })
    }

    if (
      ['add_server', 'update_server', 'rename_server'].includes(input.action) &&
      (input.password !== undefined ||
        input.private_key !== undefined ||
        input.passphrase !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Literal passwords, private keys, and passphrases cannot be persisted. Use password_env, private_key_path, passphrase_env, or agent_env.',
      })
    }

    if (
      input.action === 'rename_server' &&
      !input.new_name &&
      !input.name &&
      !input.label &&
      !input.clear_name
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['new_name'],
        message: 'new_name or clear_name is required for rename_server',
      })
    }

    if (input.action === 'update_server') {
      const hasUpdate = [
        input.name,
        input.label,
        input.host,
        input.port,
        input.username,
        input.password_env,
        input.private_key_path,
        input.passphrase_env,
        input.agent,
        input.agent_env,
        input.host_fingerprint_sha256,
        input.ready_timeout_ms,
        input.keepalive_interval_ms,
        input.clear_name,
        input.clear_authentication,
      ].some((value) => value !== undefined && value !== false)
      if (!hasUpdate) {
        ctx.addIssue({
          code: 'custom',
          message: 'update_server requires at least one field to update',
        })
      }
    }

    const noConnection = new Set([
      'connect',
      'connect_server',
      'list_servers',
      'get_server',
      'add_server',
      'update_server',
      'rename_server',
      'delete_server',
      'list_connections',
      'close_all',
    ])
    if (!noConnection.has(input.action) && !input.connection_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['connection_id'],
        message: `connection_id is required for ${input.action}`,
      })
    }

    if (
      ['cd', 'stat', 'read_file', 'write_file', 'mkdir', 'delete'].includes(
        input.action,
      ) &&
      !input.path
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['path'],
        message: `path is required for ${input.action}`,
      })
    }
    if (input.action === 'exec' && !input.command) {
      ctx.addIssue({
        code: 'custom',
        path: ['command'],
        message: 'command is required for exec',
      })
    }
    if (input.action === 'shell_write' && !input.command) {
      ctx.addIssue({
        code: 'custom',
        path: ['command'],
        message: 'command is required for shell_write',
      })
    }
    if (
      input.action === 'upload' &&
      (!input.local_path || !input.remote_path)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'local_path and remote_path are required for upload',
      })
    }
    if (
      input.action === 'download' &&
      (!input.remote_path || !input.local_path)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'remote_path and local_path are required for download',
      })
    }
    if (input.action === 'write_file' && input.content === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'content is required for write_file',
      })
    }
    if (input.action === 'rename' && (!input.path || !input.destination_path)) {
      ctx.addIssue({
        code: 'custom',
        message: 'path and destination_path are required for rename',
      })
    }
  })

const description = `
Professional persistent SSH manager for Codewolf itself. It has two separate concepts:

1. Configured servers, persisted globally in \`~/.codewolf/ssh-servers.json\` and reusable from every project and after restarting Codewolf.
2. Active SSH connections, kept alive for the current CLI process and referenced as \`ssh://<connection_id>\`.

Configured-server actions:
- \`list_servers\`: list saved servers. Always use this when asked which SSH servers are configured; never inspect Codewolf folders manually.
- \`get_server\`: inspect one saved server by ID/ref, unique name, host, host:port, or username@host.
- \`add_server\`: save a new server configuration.
- \`update_server\`: edit host, port, username, name, authentication references, fingerprint, or timeouts.
- \`rename_server\`: change only its human-friendly name; use \`clear_name\` to return to the host fallback.
- \`delete_server\`: remove the saved configuration. Active connections stay open unless \`close_connections\` is true.
- \`connect_server\`: connect using a saved server and optional ephemeral credential overrides.

Connection actions:
- \`connect\`: connect directly. By default \`save_server=true\`, so the non-secret configuration is remembered globally.
- \`list_connections\`, \`status\`, \`pwd\`, \`cd\`, \`list\`, \`stat\`, \`read_file\`.
- \`exec\`, persistent shell actions, SFTP transfers, remote mutations, \`close\`, and \`close_all\`.

Naming and compatibility:
- Use \`name\` for new configurations; \`label\` remains accepted for older calls.
- A server without a configured name is displayed only by its host.
- Literal passwords, private keys, and passphrases are never persisted. Save only environment-variable names, key paths, or agent references.

Security:
- Reading/listing configured servers and remote navigation are read-only.
- Connecting, changing server configurations, executing commands, transferring data, or mutating remote files are controlled by SSH Safe Mode in /config.
- Reading protected .env files can require a separate permission.
- Always explain remote changes in \`reason\`.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'add_server',
    name: 'produccion',
    host: 'server.example.com',
    username: 'deploy',
    private_key_path: '~/.ssh/id_ed25519',
    reason: 'Save the production SSH server requested by the user.',
  },
  endsAgentStep,
})}
`.trim()

export const sshRemoteParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
