/**
 * Union type of all available tool names
 */
export type ToolName =
  | 'add_message'
  | 'apply_patch'
  | 'ask_user'
  | 'code_search'
  | 'end_turn'
  | 'ecosystem_research'
  | 'find_files'
  | 'glob'
  | 'gravity_index'
  | 'gitzip'
  | 'list_directory'
  | 'lookup_agent_info'
  | 'propose_str_replace'
  | 'propose_write_file'
  | 'read_docs'
  | 'read_files'
  | 'read_subtree'
  | 'read_url'
  | 'render_ui'
  | 'run_file_change_hooks'
  | 'run_terminal_command'
  | 'set_messages'
  | 'set_output'
  | 'skill'
  | 'ssh_remote'
  | 'spawn_agents'
  | 'str_replace'
  | 'suggest_followups'
  | 'task_completed'
  | 'think_deeply'
  | 'web_search'
  | 'write_file'
  | 'write_todos'

/**
 * Map of tool names to their parameter types
 */
export interface ToolParamsMap {
  add_message: AddMessageParams
  apply_patch: ApplyPatchParams
  ask_user: AskUserParams
  code_search: CodeSearchParams
  end_turn: EndTurnParams
  ecosystem_research: EcosystemResearchParams
  find_files: FindFilesParams
  glob: GlobParams
  gravity_index: GravityIndexParams
  gitzip: GitzipParams
  list_directory: ListDirectoryParams
  lookup_agent_info: LookupAgentInfoParams
  propose_str_replace: ProposeStrReplaceParams
  propose_write_file: ProposeWriteFileParams
  read_docs: ReadDocsParams
  read_files: ReadFilesParams
  read_subtree: ReadSubtreeParams
  read_url: ReadUrlParams
  render_ui: RenderUiParams
  run_file_change_hooks: RunFileChangeHooksParams
  run_terminal_command: RunTerminalCommandParams
  set_messages: SetMessagesParams
  set_output: SetOutputParams
  skill: SkillParams
  ssh_remote: SshRemoteParams
  spawn_agents: SpawnAgentsParams
  str_replace: StrReplaceParams
  suggest_followups: SuggestFollowupsParams
  task_completed: TaskCompletedParams
  think_deeply: ThinkDeeplyParams
  web_search: WebSearchParams
  write_file: WriteFileParams
  write_todos: WriteTodosParams
}

/**
 * Add a new message to the conversation history. To be used for complex requests that can't be solved in a single step, as you may forget what happened!
 */
export interface AddMessageParams {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Apply a file operation (create, update, or delete) using Codex-style apply_patch format.
 */
export interface ApplyPatchParams {
  /** The file operation to perform. */
  operation: {
    /** Operation type: create_file, update_file, or delete_file */
    type: 'create_file' | 'update_file' | 'delete_file'
    /** File path relative to project root */
    path: string
    /** Diff content. Required for create_file and update_file. Lines prefixed with + for creates, unified diff with @@ hunks for updates. */
    diff?: string
  }
}

/**
 * Ask the user multiple choice questions and pause execution until they respond.
 */
export interface AskUserParams {
  /** List of multiple choice questions to ask the user */
  questions: {
    /** The question to ask the user */
    question: string
    /** Short label (max 12 chars) displayed as a chip/tag */
    header?: string
    /** Array of answer options with label and optional description (minimum 2) */
    options: {
      /** The display text for this option */
      label: string
      /** Explanation shown when option is focused */
      description?: string
    }[]
    /** If true, allows selecting multiple options (checkbox). If false, single selection only (radio). */
    multiSelect?: boolean
    /** Validation rules for "Other" text input */
    validation?: {
      /** Maximum length for "Other" text input */
      maxLength?: number
      /** Minimum length for "Other" text input */
      minLength?: number
      /** Regex pattern for "Other" text input */
      pattern?: string
      /** Custom error message when pattern fails */
      patternError?: string
    }
  }[]
}

/**
 * Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.
 */
export interface CodeSearchParams {
  /** The pattern to search for. */
  pattern: string
  /** Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-g *.ts -g *.js" for TypeScript and JavaScript files only, "-g !*.test.ts" to exclude Typescript test files,  "-A 3" for 3 lines after match, "-B 2" for 2 lines before match). */
  flags?: string
  /** Optional working directory to search within, relative to the project root. Defaults to searching the entire project. */
  cwd?: string
  /** Maximum number of results to return per file. Defaults to 15. There is also a global limit of 250 results across all files. */
  maxResults?: number
}

/**
 * End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.
 */
export interface EndTurnParams {}

/**
 * Query official npm Registry, PyPI JSON, or pkg.go.dev APIs with compact cached output.
 */
export interface EcosystemResearchParams {
  ecosystem: 'npm' | 'pypi' | 'go'
  operation:
    | 'search'
    | 'package'
    | 'documentation'
    | 'symbols'
    | 'versions'
    | 'vulnerabilities'
  query?: string
  package?: string
  module?: string
  version?: string
  topic?: string
  limit?: number
  refresh?: boolean
}

/**
 * Find several files related to a brief natural language description of the files or the name of a function or class you are looking for.
 */
export interface FindFilesParams {
  /** A brief natural language description of the files or the name of a function or class you are looking for. It's also helpful to mention a directory or two to look within. */
  prompt: string
}

/**
 * Search for files matching a glob pattern. Returns matching file paths sorted by modification time.
 */
export interface GlobParams {
  /** Glob pattern to match files against (e.g., *.js, src/glob/*.ts, glob/test/glob/*.go). */
  pattern: string
  /** Optional working directory to search within, relative to project root. If not provided, searches from project root. */
  cwd?: string
}

/**
 * Use the Gravity Index tool discovery and install API.
 */
export interface GravityIndexParams {
  /** Which Gravity Index operation to perform. search: recommend a provider; browse: list catalog services; list_categories: list categories with counts; get_service: full detail for a known slug; report_integration: report a completed integration. */
  action:
    | 'search'
    | 'browse'
    | 'list_categories'
    | 'get_service'
    | 'report_integration'
  /** For action "search": what the user needs, including stack, constraints, and required capabilities. */
  query?: string
  /** For action "search": continue a previous search. For action "report_integration": the search_id from the earlier search result (required). */
  search_id?: string
  /** For action "search": optional structured JSON context about the project, stack, or constraints. */
  context?: Record<string, any>
  /** For action "browse": optional category filter, e.g. Database, Auth, Payments, Hosting, Email, AI. */
  category?: string
  /** For action "browse": optional keyword filter, e.g. sendgrid or postgres. */
  q?: string
  /** For action "get_service": service slug, e.g. supabase, stripe, sendgrid (required). */
  slug?: string
  /** For action "report_integration": slug of the service that was actually integrated (required). */
  integrated_slug?: string
}

/**
 * List files and directories in the specified path. Returns separate arrays of file names and directory names.
 */
export interface ListDirectoryParams {
  /** Directory path to list, relative to the project root. */
  path: string
}

/**
 * Retrieve information about an agent by ID
 */
export interface LookupAgentInfoParams {
  /** Agent ID (short local or full published format) */
  agentId: string
}

/**
 * Propose string replacements in a file without actually applying them.
 */
export interface ProposeStrReplaceParams {
  /** The path to the file to edit. */
  path: string
  /** Array of replacements to make. */
  replacements: {
    /** The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation. */
    oldString: string
    /** The string to replace the corresponding oldString with. Can be empty to delete. */
    newString: string
    /** Whether to allow multiple replacements of oldString. */
    allowMultiple?: boolean
  }[]
}

/**
 * Propose creating or editing a file without actually applying the changes.
 */
export interface ProposeWriteFileParams {
  /** Path to the file relative to the **project root** */
  path: string
  /** What the change is intended to do in only one sentence. */
  instructions: string
  /** Edit snippet to apply to the file. */
  content: string
}

/**
 * Fetch up-to-date documentation for libraries and frameworks using Context7 API.
 */
export interface ReadDocsParams {
  /** The library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation if possible. Only public libraries available in Context7's database are supported, so small or private libraries may not be available. */
  libraryTitle: string
  /** Specific topic to focus on (e.g., "routing", "hooks", "authentication") */
  topic: string
  /** Optional maximum number of tokens to return. Defaults to 20000. Values less than 10000 are automatically increased to 10000. */
  max_tokens?: number
}

/**
 * Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.
 */
export interface ReadFilesParams {
  /** List of file paths to read. */
  paths: string[]
}

/**
 * Read one or more directory subtrees (as a blob including subdirectories, file names, and parsed variables within each source file) or return parsed variable names for files. If no paths are provided, returns the entire project tree.
 */
export interface ReadSubtreeParams {
  /** List of paths to directories or files. Relative to the project root. If omitted, the entire project tree is used. */
  paths?: string[]
  /** Maximum token budget for the subtree blob; the tree will be truncated to fit within this budget by first dropping file variables and then removing the most-nested files and directories. */
  maxTokens?: number
}

/**
 * Fetch a URL and extract readable text from the page.
 */
export interface ReadUrlParams {
  /** The full http:// or https:// URL to fetch and extract readable text from. */
  url: string
  /** Maximum number of extracted text characters to return. Defaults to 20000. */
  max_chars?: number
}

/**
 * Render a small interactive UI widget in the Codewolf CLI. Currently supports a button that opens a link.
 */
export interface RenderUiParams {
  /** The UI widget to render. */
  widget: {
    /** Widget type. Currently, the only supported widget is button. */
    type: 'button'
    /** Short button label shown to the user. */
    text: string
    /** The http:// or https:// URL to open when the user clicks the button. */
    link: string
    /** Theme-aware color treatment. Use primary for the main action and secondary for lower-emphasis actions. */
    variant?: 'primary' | 'secondary'
  }
}

/**
 * Parameters for run_file_change_hooks tool
 */
export interface RunFileChangeHooksParams {
  /** List of file paths that were changed and should trigger file change hooks */
  files: string[]
}

/**
 * Execute a CLI command from the **project root** (different from the user's cwd).
 */
export interface RunTerminalCommandParams {
  /** CLI command valid for user's OS. */
  command: string
  /** Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC */
  process_type?: 'SYNC' | 'BACKGROUND'
  /** The working directory to run the command in. Default is the project root. */
  cwd?: string
  /** Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30 */
  timeout_seconds?: number
}

/**
 * Set the conversation history to the provided messages.
 */
export interface SetMessagesParams {
  messages: any
}

/**
 * JSON object to set as the agent output. This completely replaces any previous output. If the agent was spawned, this value will be passed back to its parent. If the agent has an outputSchema defined, the output will be validated against it.
 */
export interface SetOutputParams {}

/**
 * Load a skill's full instructions when relevant to the current task. Skills are loaded on-demand - only load them when you need their specific guidance.
 */
export interface SkillParams {
  /** The name of the skill to load */
  name: string
}

/**
 * Persistent SSH connections for Codewolf itself. Connections live for the current CLI process and can coexist across different servers.
 */

/**
 * Create gitignore-aware project archives locally or through a persistent SSH connection.
 */
export interface GitzipParams {
  action: 'create' | 'upload' | 'remote_create' | 'remote_extract'
  /** Project directory, or remote archive path for remote_extract. */
  source_path?: string
  /** Archive destination; relative paths are resolved inside source_path. */
  output_path?: string
  format?: 'zip' | 'tar' | 'tar.gz'
  /** Active SSH connection ID or ssh:// reference. */
  connection_id?: string
  /** Remote upload destination. */
  remote_path?: string
  extract_remote?: boolean
  extract_path?: string
  cleanup_local?: boolean
  cleanup_remote_archive?: boolean
  /** Additional gitignore-style patterns. */
  extra_excludes?: string[]
  /** Include protected .env files; may require separate permission. */
  include_protected_env?: boolean
  overwrite?: boolean
  compression_level?: number
  /** Advanced safe argv values for remote tar/zip. */
  archive_args?: string[]
  timeout_seconds?: number
  reason?: string
}

export interface SshRemoteParams {
  action:
    | 'connect'
    | 'connect_server'
    | 'list_servers'
    | 'get_server'
    | 'add_server'
    | 'update_server'
    | 'rename_server'
    | 'delete_server'
    | 'vault_status'
    | 'unlock_vault'
    | 'lock_vault'
    | 'change_vault_password'
    | 'set_server_password'
    | 'clear_server_password'
    | 'set_server_passphrase'
    | 'clear_server_passphrase'
    | 'list_connections'
    | 'status'
    | 'pwd'
    | 'cd'
    | 'list'
    | 'stat'
    | 'read_file'
    | 'exec'
    | 'shell_open'
    | 'shell_write'
    | 'shell_read'
    | 'upload'
    | 'download'
    | 'write_file'
    | 'mkdir'
    | 'rename'
    | 'delete'
    | 'close'
    | 'close_all'
  /** Active connection identifier returned by connect/connect_server, or its ssh:// reference. */
  connection_id?: string
  /** Configured server ID/ref, unique configured name, host, host:port, or username@host. */
  server_id?: string
  /** Human-friendly persistent server name. */
  name?: string
  /** Legacy alias for name. Prefer name for new calls. */
  label?: string
  new_name?: string
  clear_name?: boolean
  clear_authentication?: boolean
  close_connections?: boolean
  /** Ask the user directly in the CLI for the SSH password; the agent never receives it. */
  prompt_password?: boolean
  /** Ask the user directly in the CLI for a private-key passphrase. */
  prompt_passphrase?: boolean
  /** For direct connect, remember the non-secret server configuration globally. Defaults to true. */
  save_server?: boolean
  host?: string
  port?: number
  username?: string
  /** Ephemeral SSH password. Never persisted. Prefer prompt_password for local secure entry. */
  password?: string
  /** Environment variable containing the SSH password. */
  password_env?: string
  /** Path to an OpenSSH private key. Relative paths are made absolute before a server is saved. */
  private_key_path?: string
  /** Ephemeral private key contents. Never persisted. */
  private_key?: string
  /** Ephemeral private-key passphrase. Never persisted. */
  passphrase?: string
  passphrase_env?: string
  /** SSH agent socket path. */
  agent?: string
  /** Environment variable containing the SSH agent socket path. */
  agent_env?: string
  /** Optional expected SHA-256 host-key fingerprint. */
  host_fingerprint_sha256?: string
  ready_timeout_ms?: number
  keepalive_interval_ms?: number
  path?: string
  destination_path?: string
  local_path?: string
  remote_path?: string
  content?: string
  encoding?: 'utf8' | 'base64'
  command?: string
  timeout_seconds?: number
  pty?: boolean
  cols?: number
  rows?: number
  wait_ms?: number
  max_bytes?: number
  recursive?: boolean
  overwrite?: boolean
  reason?: string
}

/**
 * Spawn multiple agents and send a prompt and/or parameters to each of them. These agents will run in parallel. Note that that means they will run independently. If you need to run agents sequentially, use spawn_agents with one agent at a time instead.
 */
export interface SpawnAgentsParams {
  agents: {
    /** Agent to spawn */
    agent_type: string
    /** Prompt to send to the agent */
    prompt?: string
    /** Parameters object for the agent (if any) */
    params?: Record<string, any>
  }[]
}

/**
 * Replace strings in a file with new strings.
 */
export interface StrReplaceParams {
  /** The path to the file to edit. */
  path: string
  /** Array of replacements to make. */
  replacements: {
    /** The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation. */
    oldString: string
    /** The string to replace the corresponding oldString with. Can be empty to delete. */
    newString: string
    /** Whether to allow multiple replacements of oldString. */
    allowMultiple?: boolean
  }[]
}

/**
 * Suggest clickable followup prompts to the user.
 */
export interface SuggestFollowupsParams {
  /** List of suggested followup prompts the user can click to send */
  followups: {
    /** The full prompt text to send as a user message when clicked */
    prompt: string
    /** Short display label for the card (defaults to truncated prompt if not provided) */
    label?: string
  }[]
}

/**
 * Signal that the task is complete. Use this tool when:
- The user's request is completely fulfilled
- You need clarification from the user before continuing
- You are stuck or need help from the user to continue

This tool explicitly marks the end of your work on the current task.
 */
export interface TaskCompletedParams {}

/**
 * Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.
 */
export interface ThinkDeeplyParams {
  /** Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step). */
  thought: string
}

/**
 * Search the web for current information using Serper API.
 */
export interface WebSearchParams {
  /** The search query to find relevant web content */
  query: string
  /** Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'. */
  depth?: 'standard' | 'deep'
}

/**
 * Create or edit a file with the given content.
 */
export interface WriteFileParams {
  /** Path to the file relative to the **project root** */
  path: string
  /** What the change is intended to do in only one sentence. */
  instructions: string
  /** Edit snippet to apply to the file. */
  content: string
}

/**
 * Write a todo list to track tasks for multi-step implementations. Use this frequently to maintain an updated step-by-step plan.
 */
export interface WriteTodosParams {
  /** List of todos with their completion status. Add ALL of the applicable tasks to the list, so you don't forget to do anything. Try to order the todos the same way you will complete them. Do not mark todos as completed if you have not completed them yet! */
  todos: {
    /** Description of the task */
    task: string
    /** Whether the task is completed */
    completed: boolean
  }[]
}

/**
 * Get parameters type for a specific tool
 */
export type GetToolParams<T extends ToolName> = ToolParamsMap[T]
