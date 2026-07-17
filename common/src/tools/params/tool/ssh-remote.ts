import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

export const SSH_REMOTE_ACTIONS = [
  'connect',
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
        'Identifier returned by connect, or its ssh:// reference. Required for connection actions.',
      ),
    label: z.string().min(1).max(80).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).default(22).optional(),
    username: z.string().min(1).optional(),
    password: z
      .string()
      .optional()
      .describe(
        'SSH password. Prefer password_env so the secret is not written into chat history.',
      ),
    password_env: z
      .string()
      .min(1)
      .optional()
      .describe('Local environment variable containing the SSH password.'),
    private_key_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Local path to an OpenSSH private key. Relative paths use the project root.',
      ),
    private_key: z
      .string()
      .optional()
      .describe('Private key contents. Prefer private_key_path.'),
    passphrase: z.string().optional(),
    passphrase_env: z.string().min(1).optional(),
    agent: z
      .string()
      .optional()
      .describe('SSH agent socket. Usually SSH_AUTH_SOCK.'),
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
      ].filter(Boolean).length
      if (authCount === 0) {
        ctx.addIssue({
          code: 'custom',
          message:
            'connect requires password/password_env, private_key/private_key_path, or agent authentication',
        })
      }
    }

    const noConnection = new Set(['connect', 'list_connections', 'close_all'])
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
Persistent SSH connections for Codewolf itself. Connections live for the current CLI process and can coexist across different servers.

Use this tool instead of local terminal commands for remote systems. The returned \`connection_id\`/\`connection_ref\` is the stable link for later calls.

Read/navigation actions: \`list_connections\`, \`status\`, \`pwd\`, \`cd\`, \`list\`, \`stat\`, \`read_file\`.
Sensitive actions controlled by /config: \`connect\`, \`exec\`, \`shell_open\`, \`shell_write\`, \`upload\`, \`download\`, \`write_file\`, \`mkdir\`, \`rename\`, and \`delete\`.
Lifecycle actions: \`close\` and \`close_all\`.

For commands that must retain shell state (exports, activated environments, long-running programs), call \`shell_open\`, then \`shell_write\`, and poll with \`shell_read\`. For isolated commands use \`exec\`; it executes in the connection's current directory. \`cd\` changes that persistent directory for later exec/file actions.

Security:
- Prefer \`password_env\`, \`passphrase_env\`, \`private_key_path\`, or \`agent\` over embedding secrets.
- Credentials are kept only in memory and are never returned.
- Reading protected .env files can require a separate permission configured in /config.
- Never upload, download, edit, delete, or execute remotely without describing why in \`reason\`.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'connect',
    label: 'staging',
    host: 'server.example.com',
    username: 'deploy',
    private_key_path: '~/.ssh/id_ed25519',
    reason: 'Connect to the staging server requested by the user.',
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
