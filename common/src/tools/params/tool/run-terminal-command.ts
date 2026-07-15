import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const terminalCommandOutputSchema = z.union([
  z.object({
    command: z.string(),
    executedCommand: z.string().optional(),
    startingCwd: z.string().optional(),
    shell: z.string().optional(),
    message: z.string().optional(),
    stderr: z.string().optional(),
    stdout: z.string().optional(),
    exitCode: z.number().optional(),
  }),
  z.object({
    command: z.string(),
    executedCommand: z.string().optional(),
    startingCwd: z.string().optional(),
    shell: z.string().optional(),
    message: z.string().optional(),
    stderr: z.string().optional(),
    stdoutOmittedForLength: z.literal(true),
    exitCode: z.number().optional(),
  }),
  z.object({
    command: z.string(),
    processId: z.number(),
    backgroundProcessStatus: z.enum(['running', 'completed', 'error']),
  }),
  z.object({
    command: z.string(),
    errorMessage: z.string(),
  }),
])

export const gitCommitGuidePrompt = `
### Using git to commit changes

When the user explicitly requests a Git commit:

1. Review the relevant diff and recent commit style.
2. Stage only files that belong to the requested change. Never use \`git add -A\` when unrelated work may exist.
3. Write a concise semantic Summary and a technical Description in the language requested by the user. Describe the implemented behavior, not the mechanical act of saving or verifying changes.
4. Create the commit with separate \`-m\` arguments, for example:
   \`git commit -m "Agregar validación de sesiones" -m "Valida el estado persistido antes de reanudar una conversación y evita cargar mensajes dañados."\`

The terminal always executes Bash-compatible syntax from the active project directory on Windows, Linux and macOS. Do not prepend a redundant \`cd\`, do not paste a Windows \`C:\\...\` path into Bash, do not alter Git configuration, do not add generated-by footers, and never push automatically.
`

const toolName = 'run_terminal_command'
const endsAgentStep = true
const inputSchema = z
  .object({
    // Can be empty to use it for a timeout.
    command: z
      .string()
      .min(1, 'Command cannot be empty')
      .describe(
        `Bash-compatible command executed from the selected working directory on Windows, Linux or macOS. Prefer relative paths and do not prepend a redundant cd to the project root.`,
      ),
    process_type: z
      .enum(['SYNC', 'BACKGROUND'])
      .default('SYNC')
      .describe(
        `Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC`,
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        `The working directory to run the command in. Default is the project root.`,
      ),
    timeout_seconds: z
      .number()
      .default(30)
      .optional()
      .describe(
        `Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30`,
      ),
  })
  .describe(
    `Execute a Bash-compatible command from the project root unless cwd is explicitly provided.`,
  )
const description = `
Stick to these use cases:
1. Typechecking the project or running build (e.g., "npm run build"). Reading the output can help you edit code to fix build errors. If possible, use an option that performs checks but doesn't emit files, e.g. \`tsc --noEmit\`.
2. Running tests (e.g., "npm test"). Reading the output can help you edit code to fix failing tests. Or, you could write new unit tests and then run them.
3. Moving, renaming, or deleting files and directories. These actions can be vital for refactoring requests. Use Bash commands such as \`mv\` and \`rm\`.

Most likely, you should ask for permission for any other type of command you want to run. If asking for permission, show the user the command you want to run using \`\`\` tags and *do not* use the tool call format, e.g.:
\`\`\`bash
git branch -D foo
\`\`\`

DO NOT do any of the following:
1. Run commands that can modify files outside of the project directory, install packages globally, install virtual environments, or have significant side effects outside of the project directory, unless you have explicit permission from the user. Treat anything outside of the project directory as read-only.
2. Run \`git push\` because it can break production (!) if the user was not expecting it. Don't run \`git commit\`, \`git rebase\`, or related commands unless you get explicit permission. If a user asks to commit changes, you can do so, but you should not invoke any further git commands beyond the git commit command.
3. Run scripts without asking. Especially don't run scripts that could run against the production environment or have permanent effects without explicit permission from the user.
4. Be careful with any command that has big or irreversible effects. Anything that touches a production environment, servers, the database, or other systems that could be affected by a command should be run with explicit permission from the user.
5. Use the run_terminal_command tool to create or edit files. Do not use \`cat\` or \`echo\` to create or edit files. You should instead use other tools for creating or editing files.
6. Use the wrong package manager for the project. For example, if the project uses \`pnpm\` or \`bun\` or \`yarn\`, you should not use \`npm\`. Similarly not everyone uses \`pip\` for python, etc.

Do:
- If there's an opportunity to use "-y" or "--yes" flags, use them. Any command that prompts for confirmation will hang if you don't use the flags.

Notes:
- If the user references a specific file, it could be either from their cwd or from the project root. You **must** determine which they are referring to (either infer or ask). Then, you must specify the path relative to the project root (or use the cwd parameter)
- Commands can succeed without giving any output, e.g. if no type errors were found.

${gitCommitGuidePrompt}

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    command: 'echo "hello world"',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    command:
      'git commit -m "Agregar validación de sesiones" -m "Valida el estado persistido antes de reanudar una conversación."',
  },
  endsAgentStep,
})}
    `.trim()

export const runTerminalCommandParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(terminalCommandOutputSchema),
} satisfies $ToolParams
