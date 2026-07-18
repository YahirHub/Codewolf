import z from 'zod/v4'

import { jsonObjectSchema } from '../../../types/json'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const GITZIP_ACTIONS = [
  'create',
  'upload',
  'remote_create',
  'remote_extract',
] as const

export const GITZIP_FORMATS = ['zip', 'tar', 'tar.gz'] as const

export type GitzipAction = (typeof GITZIP_ACTIONS)[number]
export type GitzipFormat = (typeof GITZIP_FORMATS)[number]

const toolName = 'gitzip'
const endsAgentStep = true

const inputSchema = z
  .object({
    action: z.enum(GITZIP_ACTIONS),
    source_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Project directory to package, or remote archive path for remote_extract. Local paths are resolved from the current Codewolf project; remote paths are resolved from the active SSH directory.',
      ),
    output_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Archive destination. A relative path is resolved inside source_path. When omitted, creates <project-name>.<format> inside the project and excludes it from the archive.',
      ),
    format: z
      .enum(GITZIP_FORMATS)
      .optional()
      .describe(
        'Archive format. Inferred from output_path when possible; otherwise create/upload default to zip and remote_create defaults to tar.gz.',
      ),
    connection_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Active SSH connection ID or ssh:// reference. Open it first with ssh_remote connect/connect_server.',
      ),
    remote_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'For upload, destination archive path on the connected server. Defaults to the archive filename in the active remote directory.',
      ),
    extract_remote: z
      .boolean()
      .default(false)
      .optional()
      .describe('After upload, extract the archive on the remote server.'),
    extract_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Remote extraction directory. Defaults to the archive parent for upload/remote_extract.',
      ),
    cleanup_local: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'For upload, delete the generated local archive only after upload and optional extraction succeed.',
      ),
    cleanup_remote_archive: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Delete the uploaded/remote archive after successful extraction.',
      ),
    extra_excludes: z
      .array(z.string().min(1))
      .max(200)
      .default([])
      .optional()
      .describe(
        'Additional gitignore-style patterns, relative to source_path. Nested .gitignore and Codewolf ignore files are always honored.',
      ),
    include_protected_env: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Include protected .env/.env.* files. When /config protection is enabled this requires a separate explicit permission. Defaults to false.',
      ),
    overwrite: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Replace an existing archive or extracted file when supported.',
      ),
    compression_level: z
      .number()
      .int()
      .min(0)
      .max(9)
      .optional()
      .describe('Compression level from 0 (store) to 9 (maximum).'),
    archive_args: z
      .array(z.string().min(1).max(300))
      .max(40)
      .default([])
      .optional()
      .describe(
        'Advanced arguments passed as individual argv values to remote tar/zip only. They are shell-quoted and must match a conservative metadata/compression allowlist; options that can add files, recurse, execute commands, or replace the manifest are rejected.',
      ),
    timeout_seconds: z
      .number()
      .int()
      .min(1)
      .max(86_400)
      .default(600)
      .optional(),
    reason: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (!input.source_path) {
      ctx.addIssue({
        code: 'custom',
        path: ['source_path'],
        message: `source_path is required for ${input.action}`,
      })
    }

    if (
      ['upload', 'remote_create', 'remote_extract'].includes(input.action) &&
      !input.connection_id
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['connection_id'],
        message: `connection_id is required for ${input.action}`,
      })
    }

    if (input.action !== 'upload' && input.extract_remote) {
      ctx.addIssue({
        code: 'custom',
        path: ['extract_remote'],
        message: 'extract_remote is only valid for upload',
      })
    }

    if (input.action !== 'upload' && input.cleanup_local) {
      ctx.addIssue({
        code: 'custom',
        path: ['cleanup_local'],
        message: 'cleanup_local is only valid for upload',
      })
    }

    if (
      input.cleanup_remote_archive &&
      input.action !== 'remote_extract' &&
      !(input.action === 'upload' && input.extract_remote)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cleanup_remote_archive'],
        message:
          'cleanup_remote_archive requires remote_extract or upload with extract_remote=true',
      })
    }

    if (input.archive_args?.length && input.action !== 'remote_create') {
      ctx.addIssue({
        code: 'custom',
        path: ['archive_args'],
        message: 'archive_args are only supported by remote_create',
      })
    }
  })

const description = `
Create deployment-ready project archives using GitZip semantics without packaging files ignored by Git.

Actions:
- \`create\`: build a local ZIP, TAR, or TAR.GZ archive.
- \`upload\`: build the local archive, upload it through an existing persistent SSH connection, and optionally extract it remotely.
- \`remote_create\`: scan a project on an existing SSH connection and run remote \`tar\` or \`zip\` with an explicit manifest containing only allowed paths.
- \`remote_extract\`: extract a remote archive into a chosen remote directory.

Ignore behavior:
- Honors root and nested \`.gitignore\` files.
- Also honors nested \`.codewolfignore\`, legacy \`.codebuffignore\`, and \`.manicodeignore\` files.
- Always excludes \`.git/\`, the output archive itself, temporary manifests, and protected \`.env\` files unless \`include_protected_env=true\` is explicitly authorized.
- Supports additional gitignore-style patterns through \`extra_excludes\`.
- Preserves empty directories and symbolic links where the archive format/tool supports them.

Path rules:
- Local \`source_path\` is relative to the current Codewolf project unless absolute.
- Relative \`output_path\` is resolved inside \`source_path\`.
- Remote paths are resolved from the active SSH connection's current directory.
- Use \`ssh_remote connect_server\` first, then pass only its \`connection_id\` here.

Safety:
- Creating local archives is controlled by normal Safe Mode.
- Uploading, remote creation, and remote extraction are controlled by SSH Safe Mode.
- Protected environment files require a second explicit permission when inclusion is requested.
- Advanced remote arguments are passed as separate quoted argv values and accepted only from a conservative allowlist that cannot replace the filtered manifest.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'upload',
    source_path: '.',
    format: 'tar.gz',
    connection_id: 'ssh://prod-1',
    remote_path: '/opt/releases/app.tar.gz',
    extract_remote: true,
    extract_path: '/opt/apps/app',
    overwrite: true,
    reason:
      'Package the project using its .gitignore and deploy it to the connected server.',
  },
  endsAgentStep,
})}
`.trim()

export const gitzipParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
