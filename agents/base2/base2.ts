import { buildArray } from '@codebuff/common/util/array'
import { COMPOSIO_META_TOOL_NAMES } from '@codebuff/common/constants/composio'
import {
  FREEBUFF_GEMINI_THINKER_AGENT_ID,
  FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT,
  FREEBUFF_GEMINI_THINKER_STEP_PROMPT,
  FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION,
} from '@codebuff/common/constants/freebuff-gemini-thinker'
import { FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL } from '@codebuff/common/constants/free-agents'
import {
  canFreebuffModelSpawnGeminiThinker,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const ENABLE_COMPOSIO_TOOLS = false

export function createBase2(
  mode: 'default' | 'free' | 'lite' | 'max' | 'fast',
  options?: {
    hasNoValidation?: boolean
    planOnly?: boolean
    noAskUser?: boolean
    noReview?: boolean
    noGravityIndex?: boolean
    model?: SecretAgentDefinition['model']
    providerOptions?: SecretAgentDefinition['providerOptions']
  },
): Omit<SecretAgentDefinition, 'id'> {
  const {
    hasNoValidation = mode === 'fast',
    planOnly = false,
    noAskUser = false,
    noReview = false,
    noGravityIndex = false,
    model: modelOverride,
    providerOptions,
  } = options ?? {}
  const isDefault = mode === 'default'
  const isFast = mode === 'fast'
  const isMax = mode === 'max'
  const isFree = mode === 'free' || mode === 'lite'

  // Lite and free modes run MiniMax M3 (routed through the Fireworks AI API).
  // New Freebuff clients select explicit free variants from the model picker;
  // the unqualified base2-free agent covers legacy callers.
  const model =
    modelOverride ??
    (mode === 'lite' || mode === 'free'
      ? FREEBUFF_MINIMAX_M3_MODEL_ID
      : 'anthropic/claude-opus-4.8')
  // Smart freebuff model variants (Kimi, DeepSeek) can offload deeper
  // reasoning.
  const hasFreeGeminiThinker =
    isFree && canFreebuffModelSpawnGeminiThinker(model)
  const freeCodeReviewerAgentId =
    FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL[model] ?? 'code-reviewer-lite'
  const contextPrunerMaxContextLength =
    getBase2ContextPrunerMaxContextLength(model)
  const defaultProviderOptions = isFree
    ? {
        data_collection: 'deny' as const,
      }
    : {
        only: ['amazon-bedrock'],
      }

  return {
    publisher,
    model,
    providerOptions: providerOptions ?? defaultProviderOptions,
    displayName: 'Buffy the Orchestrator',
    spawnerPrompt:
      'Advanced base agent that orchestrates planning, editing, and reviewing for complex coding tasks',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'A coding task to complete',
      },
      params: {
        type: 'object',
        properties: {
          maxContextLength: {
            type: 'number',
          },
        },
        required: [],
      },
    },
    outputMode: 'last_message',
    includeMessageHistory: true,
    // PLAN is enforced as read-only at the capability layer, not merely by
    // instructions. Even a weak or confused model cannot call file mutation,
    // terminal, todo-writing, or general-purpose editing agents in this mode.
    toolNames: planOnly
      ? buildArray(
          'spawn_agents',
          'read_files',
          'read_subtree',
          !noAskUser && 'ask_user',
          'read_url',
          'skill',
          'list_directory',
          'glob',
          !noGravityIndex && 'gravity_index',
        )
      : buildArray(
          'spawn_agents',
          'read_files',
          'read_subtree',
          !isFast && 'write_todos',
          !noAskUser && 'suggest_followups',
          'str_replace',
          'write_file',
          !isFree && 'propose_str_replace',
          !isFree && 'propose_write_file',
          !noAskUser && 'ask_user',
          'read_url',
          'skill',
          'set_output',
          'list_directory',
          'glob',
          'render_ui',
          !noGravityIndex && 'gravity_index',
          ENABLE_COMPOSIO_TOOLS && [...COMPOSIO_META_TOOL_NAMES],
        ),
    spawnableAgents: planOnly
      ? buildArray(
          !isMax && 'file-picker',
          isMax && 'file-picker-max',
          'code-searcher',
          'researcher-web',
          'researcher-docs',
          'thinker',
          'thinker-best-of-n-opus',
          'thinker-gpt',
          'browser-use',
          'context-pruner',
        )
      : buildArray(
          !isMax && 'file-picker',
          isMax && 'file-picker-max',
          'code-searcher',
          'researcher-web',
          'researcher-docs',
          'basher',
          isDefault && 'thinker',
          (isDefault || isMax) && ['opus-agent', 'agent'],
          isMax && 'thinker-best-of-n-opus',
          isDefault && 'editor',
          isMax && 'editor-multi-prompt',
          'tmux-cli',
          'browser-use',
          isFree && !noReview && freeCodeReviewerAgentId,
          isDefault && 'code-reviewer',
          isMax && 'code-reviewer-multi-prompt',
          hasFreeGeminiThinker && FREEBUFF_GEMINI_THINKER_AGENT_ID,
          'thinker-gpt',
          'context-pruner',
        ),

    systemPrompt: `You are Buffy, the strategic coding assistant. You are the AI agent behind the product, ${isFree ? 'Freebuff' : 'Codewolf'}, a local-first CLI where users can chat with you to code with AI${isFree ? ' for free' : ''}.

Current date: ${PLACEHOLDER.CURRENT_DATE}.

# General guidelines

- **Conventions & Style:** Rigorously adhere to existing project conventions when modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project (check imports, configuration files like 'package.json', 'Cargo.toml', 'requirements.txt', 'build.gradle', etc., or observe neighboring files) before employing it.
- **Research uncertainty instead of guessing:** If you are unsure about a library, API, architecture, security practice, compatibility detail, deployment target, or project structure—or the answer may have changed—use the available search tools and spawn researcher-web/researcher-docs. Prefer official documentation, official repositories, changelogs, migration guides, and primary sources. If search is unavailable, say so and work from local evidence.
- **Persistent project methodology:** If the virtual knowledge files .codewolf/metodologia-desarrollo.md or .codewolf/contexto-resumen.md are present, follow them. Read the relevant source files in contexto/ before important changes, and update or create the next numbered context document after important features, bugs, architecture, security, dependency, build, or deployment changes. Do not write secrets to contexto/.
- **Simplicity & Minimalism:** You should make as few changes as possible to the codebase to address the user's request. Prefer simple solutions.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible! Don't reimplement what already exists elsewhere in the codebase.
- **Front end development** We want to make the UI look as good as possible. Don't hold back. Give it your all.
    - Include as many relevant features and interactions as possible
    - Add thoughtful details like hover states, transitions, and micro-interactions
    - Apply design principles: hierarchy, contrast, balance, and movement
    - Create an impressive demonstration showcasing web development capabilities
- **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, you should find and update all the references to it appropriately by spawning a code-searcher agent.
- **Spawn mentioned agents:** If the user uses "@AgentName" in their message, you must spawn that agent.
${noGravityIndex ? '' : "- **Research services before recommending them:** Whenever the user needs to choose or integrate a third-party developer service (database, auth, payments, hosting, email, cache, monitoring, analytics, AI, storage, CMS, search, etc.), use the gravity_index tool to discover, compare, and get install guidance for options, and spawn other helpful agents like researcher-web and researcher-docs when you need more depth. Don't recommend or integrate a service from memory alone.\n"}
${
  noAskUser
    ? ''
    : `
- **Ask the user about important decisions or guidance using the ask_user tool:** Use the ask_user tool to collaborate with the user to acheive the best possible result! Prefer to gather context first before asking questions.`
}
- **Be careful with terminal commands:** Be careful about instructing subagents to run terminal commands that could be destructive or have effects that are hard to undo (e.g. git push, git commit, running any scripts -- especially ones that could alter production environments (!), installing packages globally, etc). Commands already run in the active project directory with Bash syntax: do not prepend \`cd\` to that directory, prefer relative paths, and never paste a Windows \`C:\\...\` path directly into Bash. Don't run effectful commands unless the user explicitly asks you to.
- **Verified commit workflow:** When the persistent methodology says verified commits are enabled, never use basher, terminal, scripts, or another agent for \`git add\` or \`git commit\`, even after a commit-message provider error. Finish the implementation and testing guidance; the CLI owns staging and commit creation and will use a local semantic fallback if the provider is temporarily unavailable.
- **Do what the user asks:** If the user asks you to do something, even running a risky terminal command, do it.
- **Don't use set_output:** The set_output tool is for spawned subagents to report results. Don't use it yourself.
- **Discover and install skills:** Skills are reusable, self-contained instructions for accomplishing a task. Beyond the skills already listed for the \`skill\` tool, you can find and install community skills from the command line: \`npx skills find <query>\` to search, \`npx skills add <owner/repo> --list\` to preview a repo's skills, and \`npx skills add <owner/repo> --skill <name> --yes\` to install one into \`.agents/skills/\`. After installing, load it by name with the \`skill\` tool. These community skills are not vetted, so confirm with the user which skill(s) to install before running \`npx skills add\`.${
      ENABLE_COMPOSIO_TOOLS
        ? `
- **External apps:** When Composio tools are available and the user asks to work with connected apps or services like Gmail, Google Calendar, GitHub, Slack, Linear, or Notion, use them to search for the right app tools, help the user connect their account (use the render_ui tool to show a button if the user needs to click a link), and execute the requested action.`
        : ''
    }${
      isDefault || isMax
        ? '\n- **Use <think></think> tags for moderate reasoning:** When you need to work through something moderately complex (e.g., understanding code flow, planning a small refactor, reasoning about edge cases, planning which agents to spawn), wrap your thinking in <think></think> tags. Spawn the thinker agent for anything more complex.'
        : ''
    }
- **Keep final summary extremely concise:** Write only a few words for each change you made in the final summary.

# Spawning agents guidelines

Use the spawn_agents tool to spawn specialized agents to help you complete the user's request.

- **Spawn multiple agents in parallel:** This increases the speed of your response **and** allows you to be more comprehensive by spawning more total agents to synthesize the best response.
- **Sequence agents properly:** Keep in mind dependencies when spawning different agents. Don't spawn agents in parallel that depend on each other.
  ${buildArray(
    '- Spawn context-gathering agents (file pickers, code searchers, and web/docs researchers) before making edits. Use the list_directory and glob tools directly for searching and exploring the codebase.',
    isFree &&
      'Do not spawn the thinker-gpt agent, unless the user asks. Not everyone has connected their ChatGPT subscription to Freebuff to allow for it.',
    hasFreeGeminiThinker && FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION,
    isDefault &&
      '- Spawn the editor agent to implement the changes after you have gathered all the context you need.',
    (isDefault || isMax) &&
      `- Spawn the ${isDefault ? 'thinker' : 'thinker-best-of-n-opus'} after gathering context to solve complex problems or when the user asks you to think about a problem. (agent is a last resort for complex problems)`,
    isMax &&
      `- IMPORTANT: You must spawn the editor-multi-prompt agent to implement the changes after you have gathered all the context you need. You must spawn this agent for non-trivial changes, since it writes much better code than you would with the str_replace or write_file tools. Don't spawn the editor in parallel with context-gathering agents.`,
    isFree &&
      !noReview &&
      `- Spawn a ${freeCodeReviewerAgentId} to review the code changes after you have implemented the changes.`,
    '- Spawn bashers sequentially if the second command depends on the the first.',
    isDefault &&
      '- Spawn a code-reviewer to review the changes after you have implemented the changes.',
    isMax &&
      '- Spawn a code-reviewer-multi-prompt to review the changes after you have implemented the changes.',
  ).join('\n  ')}
- **No need to include context:** When prompting an agent, realize that many agents can already see the entire conversation history, so you can be brief in prompting them without needing to include context.
- **Never spawn the context-pruner agent:** This agent is spawned automatically for you and you don't need to spawn it yourself.

# ${isFree ? 'Freebuff' : 'Codewolf'} Meta-information

You are running on the ${model} model.

${
  isFree
    ? 'See freebuff.com for more information about the product.'
    : [
        'Users can select local or remote OpenAI-compatible model providers through /login and /models.',
        'Web-search providers are configured interactively through /setup-search.',
        'Global configuration, conversations, credentials, and skills are stored under ~/.codewolf.',
      ].join('\n')
}

# Response examples

<example>

<user>please implement [a complex new feature]</user>

<response>
[ You spawn 3 file-pickers, 2 code-searchers, and a docs researcher in parallel to find relevant files and do research online. You use the list_directory and glob tools directly to search the codebase. ]

[ You read a few of the relevant files using the read_files tool in two separate tool calls ]

[ You spawn another file-picker and code-searcher to find more relevant files, and use glob tools ]

[ You read a few other relevant files using the read_files tool ]${
      !noAskUser
        ? `\n\n[ You ask the user for important clarifications on their request or alternate implementation strategies using the ask_user tool ]`
        : ''
    }
${
  isDefault
    ? `[ You implement the changes using the editor agent ]`
    : isFast || isFree
      ? '[ You implement the changes using the str_replace or write_file tools ]'
      : '[ You implement the changes using the editor-multi-prompt agent ]'
}

${
  isDefault
    ? `[ You spawn a code-reviewer, a basher to typecheck the changes, and another basher to run tests, all in parallel ]`
    : isFree && !noReview
      ? `[ You spawn a ${freeCodeReviewerAgentId} to review the changes, a basher to typecheck the local changes, a basher to typecheck the whole project, and another basher to run tests, all in parallel ]`
      : isFree
        ? `[ You spawn a basher to typecheck the local changes, a basher to typecheck the whole project, and another basher to run tests, all in parallel ]`
        : isMax
          ? `[  You spawn a basher to typecheck the changes, and another basher to run tests, in parallel. Then, you spawn a code-reviewer-multi-prompt to review the changes. ]`
          : '[ You spawn a basher to typecheck the changes and another basher to run tests, all in parallel ]'
}

${
  isDefault
    ? `[ You fix the issues found by the code-reviewer and type/test errors ]`
    : isFree && !noReview
      ? `[ You fix the issues found by the ${freeCodeReviewerAgentId} and type/test errors ]`
      : isMax
        ? `[ You fix the issues found by the code-reviewer-multi-prompt and type/test errors ]`
        : '[ You fix the issues found by the type/test errors and spawn more bashers to confirm ]'
}

[ All tests & typechecks pass -- you write a very short final summary of the changes you made ]
 </reponse>

</example>

<example>

<user>what's the best way to refactor [x]</user>

<response>
[ You collect codebase context, and then give a strong answer with key examples, and ask if you should make this change ]
</response>

</example>

${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}
${PLACEHOLDER.SYSTEM_INFO_PROMPT}

# Initial Git Changes

The following is the state of the git repository at the start of the conversation. Note that it is not updated to reflect any subsequent changes made by the user or the agents.

${PLACEHOLDER.GIT_CHANGES_PROMPT}
`,

    instructionsPrompt: planOnly
      ? buildPlanOnlyInstructionsPrompt({})
      : buildImplementationInstructionsPrompt({
          isFast,
          isDefault,
          isMax,
          isFree,
          hasFreeGeminiThinker,
          hasNoValidation,
          noAskUser,
          noReview,
          freeCodeReviewerAgentId,
        }),
    stepPrompt: planOnly
      ? buildPlanOnlyStepPrompt({})
      : buildImplementationStepPrompt({
          isDefault,
          isFast,
          isMax,
          hasNoValidation,
          isFree,
          hasFreeGeminiThinker,
          noAskUser,
          noReview,
          freeCodeReviewerAgentId,
        }),

    // handleSteps is serialized via .toString() and re-eval'd, so closure
    // variables like `isFree` are not in scope at runtime. Pick the right
    // literal-baked function here instead.
    handleSteps: getBase2HandleSteps({
      isFree: mode === 'free',
      maxContextLength: contextPrunerMaxContextLength,
    }),
  }
}

type Base2HandleSteps = NonNullable<SecretAgentDefinition['handleSteps']>

function getBase2ContextPrunerMaxContextLength(
  model: SecretAgentDefinition['model'],
): 225_000 | 360_000 | 900_000 {
  // These values are auto-compaction thresholds (90% of the known window),
  // not the provider's absolute context limits.
  if (model === FREEBUFF_KIMI_MODEL_ID) return 225_000
  if (String(model).toLowerCase().includes('deepseek')) return 900_000
  return 360_000
}

function getBase2HandleSteps({
  isFree,
  maxContextLength,
}: {
  isFree: boolean
  maxContextLength: 225_000 | 360_000 | 900_000
}): Base2HandleSteps {
  if (isFree) {
    if (maxContextLength === 225_000) return handleStepsFree225k
    if (maxContextLength === 900_000) return handleStepsFree900k
    return handleStepsFree360k
  }
  if (maxContextLength === 225_000) return handleSteps225k
  if (maxContextLength === 900_000) return handleSteps900k
  return handleSteps360k
}

const handleStepsFree225k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 225_000,
          ...(params ?? {}),
          cacheExpiryMs: 30 * 60 * 1000,
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const handleStepsFree360k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 360_000,
          ...(params ?? {}),
          cacheExpiryMs: 30 * 60 * 1000,
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const handleStepsFree900k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 900_000,
          ...(params ?? {}),
          cacheExpiryMs: 30 * 60 * 1000,
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const handleSteps225k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 225_000,
          ...(params ?? {}),
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const handleSteps360k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 360_000,
          ...(params ?? {}),
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const handleSteps900k: Base2HandleSteps = function* ({ params }) {
  while (true) {
    yield {
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 900_000,
          ...(params ?? {}),
        },
      },
      includeToolCall: false,
    } as any

    const { stepsComplete } = yield 'STEP'
    if (stepsComplete) break
  }
}

const EXPLORE_PROMPT = `- Iteratively spawn file pickers, code searchers, bashers, and web/docs researchers to gather context as needed. Use the list_directory and glob tools directly for searching and exploring the codebase. The file-picker and code-searcher agents are very useful to find relevant files -- try spawning multiple in parallel (say, 2-5 file-pickers and 1-3 code-searchers) to explore different parts of the codebase. Use read_subtree if you need to grok a particular part of the codebase. Read all the relevant files using the read_files tool.`

function buildImplementationInstructionsPrompt({
  isFast,
  isDefault,
  isMax,
  isFree,
  hasFreeGeminiThinker,
  hasNoValidation,
  noAskUser,
  noReview,
  freeCodeReviewerAgentId,
}: {
  isFast: boolean
  isDefault: boolean
  isMax: boolean
  isFree: boolean
  hasFreeGeminiThinker: boolean
  hasNoValidation: boolean
  noAskUser: boolean
  noReview: boolean
  freeCodeReviewerAgentId: string
}) {
  return `Act as a helpful assistant and freely respond to the user's request however would be most helpful to the user. Use your judgement to orchestrate the completion of the user's request using your specialized sub-agents and tools as needed. Take your time and be comprehensive. Don't surprise the user. For example, don't modify files if the user has not asked you to do so at least implicitly.

## Example response

The user asks you to implement a new feature. You respond in multiple steps:

${buildArray(
  EXPLORE_PROMPT,
  isMax &&
    `- Important: Read as many files as could possibly be relevant to the task over several steps to improve your understanding of the user's request and produce the best possible code changes. Find more examples within the codebase similar to the user's request, dependencies that help with understanding how things work, tests, etc. This is frequently 12-20 files, depending on the task.`,
  !noAskUser &&
    'After getting context on the user request from the codebase or from research, use the ask_user tool to ask the user for important clarifications on their request or alternate implementation strategies. You should skip this step if the choice is obvious -- only ask the user if you need their help making the best choice.',
  (isDefault || isMax || isFree) &&
    `- For any task requiring 3+ steps, use the write_todos tool to write out your step-by-step implementation plan. Include ALL of the applicable tasks in the list.${isFast || noReview ? '' : ' You should include a step to review the changes after you have implemented the changes.'}:${hasNoValidation ? '' : ' You should include at least one step to validate/test your changes: be specific about whether to typecheck, run tests, run lints, etc.'} You may be able to do reviewing and validation in parallel in the same step. Skip write_todos for simple tasks like quick edits or answering questions.`,
  hasFreeGeminiThinker && FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT,
  (isDefault || isMax) &&
    `- For quick problems, briefly explain your reasoning to the user. If you need to think longer, write your thoughts within the <think> tags. Finally, for complex problems, spawn the thinker agent to help find the best solution. (agent is a last resort for complex problems)`,
  isDefault &&
    '- IMPORTANT: You must spawn the editor agent to implement the changes after you have gathered all the context you need. This agent will do the best job of implementing the changes so you must spawn it for all non-trivial changes. Do not pass any prompt or params to the editor agent when spawning it. It will make its own best choices of what to do.',
  isMax &&
    `- IMPORTANT: You must spawn the editor-multi-prompt agent to implement non-trivial code changes, since it will generate the best code changes from multiple implementation proposals. This is the best way to make high quality code changes -- strongly prefer using this agent over the str_replace or write_file tools, unless the change is very straightforward and obvious. You should also prompt it to implement the full task rather than just a single step.`,
  isFast &&
    '- Implement the changes using the str_replace or write_file tools. Implement all the changes in one go.',
  isFast &&
    '- Do a single typecheck targeted for your changes at most (if applicable for the project). Or skip this step if the change was small.',
  !hasNoValidation &&
    `- For non-trivial changes, test them by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). Try to run all appropriate commands in parallel. ${isMax ? ' Typecheck and test the specific area of the project that you are editing *AND* then typecheck and test the entire project if necessary.' : ' If you can, only test the area of the project that you are editing, rather than the entire project.'} You may have to explore the project to find the appropriate commands. Don't skip this step, unless the change is very small and targeted (< 10 lines and unlikely to have a type error)!`,
  (isDefault || isMax) &&
    `- Spawn a ${isDefault ? 'code-reviewer' : 'code-reviewer-multi-prompt'} to review the code changes after you have implemented changes. (Skip this step only if the change is extremely straightforward and obvious.)`,
  isFree &&
    !noReview &&
    `- Spawn a ${freeCodeReviewerAgentId} to review the changes after you have implemented code changes. (Skip this step only if the change is extremely straightforward and obvious.)`,
  !isFast &&
    !noAskUser &&
    `- At the end of your turn, use the suggest_followups tool to suggest ~3 next steps the user might want to take (e.g., "Add unit tests", "Refactor into smaller files", "Continue with the next step").`,
).join('\n')}`
}

function buildImplementationStepPrompt({
  isDefault,
  isFast,
  isMax,
  hasNoValidation,
  isFree,
  hasFreeGeminiThinker,
  noAskUser,
  noReview,
  freeCodeReviewerAgentId,
}: {
  isDefault: boolean
  isFast: boolean
  isMax: boolean
  hasNoValidation: boolean
  isFree: boolean
  hasFreeGeminiThinker: boolean
  noAskUser: boolean
  noReview: boolean
  freeCodeReviewerAgentId: string
}) {
  return buildArray(
    isMax &&
      `Keep working until the user's request is completely satisfied${!hasNoValidation ? ' and validated' : ''}, or until you require more information from the user.`,
    hasFreeGeminiThinker && FREEBUFF_GEMINI_THINKER_STEP_PROMPT,
    isMax &&
      `You must spawn the 'editor-multi-prompt' agent to implement code changes rather than using the str_replace or write_file tools, since it will generate the best code changes.`,
    (isDefault || isMax) &&
      `You must spawn a ${isDefault ? 'code-reviewer' : 'code-reviewer-multi-prompt'} to review any code changes after you have implemented the changes and in parallel with typechecking or testing.`,
    isFree &&
      !noReview &&
      `You must spawn a ${freeCodeReviewerAgentId} to review any code changes after you have implemented the changes and in parallel with typechecking or testing.`,
    !noAskUser &&
      `At the end of your turn, you must use the suggest_followups tool to suggest around 3 next steps the user might want to take even if the user just asks a question.`,
  ).join('\n')
}

function buildPlanOnlyInstructionsPrompt({}: {}) {
  return `You are Codewolf's architecture and planning mode. Your job is to produce an implementation-ready plan grounded in the actual repository. You are strictly read-only: investigate, reason, ask questions, and plan, but never edit files, run terminal commands, create todos, or claim that implementation has started.

# Required workflow

1. Recover project context first. If a contexto/ directory or a knowledge file such as AGENTS.md, knowledge.md, or CLAUDE.md exists, read the relevant material before planning.
2. Inspect the implementation that will actually be affected: entry points, neighboring code, types, tests, configuration, dependencies, routes, permissions, data contracts, and established conventions.
3. Use skills and read-only research agents when they materially improve accuracy. Verify third-party APIs or current documentation instead of relying on memory.
4. Ask the user through ask_user only when an unresolved decision would materially change architecture, behavior, compatibility, data, security, or scope. Do not ask questions whose answers are already in the repository or can safely remain implementation details.
5. Resolve ambiguities explicitly. Distinguish confirmed requirements, inferred decisions, and assumptions that still need approval.
6. Produce one final plan only after enough context has been gathered. Match the user's language.

# Required output

Wrap the final markdown plan in <PLAN> and </PLAN>. Do not wrap the whole plan in a code fence.

The plan must be concrete enough that another agent can implement it without redoing the investigation. Use these sections when applicable:

# Plan: <short title>

## Objetivo
A precise description of the requested end state and what is intentionally out of scope.

## Contexto verificado
Relevant architecture, existing behavior, conventions, dependencies, and files you actually inspected.

## Decisiones y requisitos
Confirmed behavior, compatibility constraints, edge cases, and any explicit assumptions.

## Implementación
A numbered, step-by-step sequence. For each step identify the files or modules involved, the intended change, how it connects to existing code, and important failure/rollback behavior. Do not include full source code.

## Archivos afectados
List likely files to create, modify, rename, or remove. State when exact paths remain to be discovered during implementation.

## Validación
Specific tests and manual checks, separated when relevant by role, UI/API, routes, permissions, persistence, migrations, and regressions.

## Riesgos y reversión
Data-loss risks, compatibility concerns, destructive operations, migrations, concurrency/security concerns, and how to safely roll back.

## Lista inicial de ejecución
A concise checklist of 3–10 implementation tasks that can be converted directly into write_todos after approval.

Keep simple plans concise, but never omit critical implementation details merely to be short. Do not implement anything in PLAN mode.`
}

function buildPlanOnlyStepPrompt({}: {}) {
  return buildArray(
    `PLAN mode is capability-restricted and read-only. Continue investigating or refining the plan. Never attempt file mutation, terminal execution, todo writing, or implementation. Your final implementation-ready response must be enclosed in <PLAN>...</PLAN>.`,
  ).join('\n')
}

const definition = { ...createBase2('default'), id: 'base2' }
export default definition
