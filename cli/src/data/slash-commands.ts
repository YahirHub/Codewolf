import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import { AGENT_MODES, IS_FREEBUFF } from '../utils/constants'

import type { SkillsMap } from '@codebuff/common/types/skill'

export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
  /**
   * If true, this command can be invoked without a leading slash when the
   * input matches the command id exactly (no arguments).
   */
  implicitCommand?: boolean
  /**
   * If set, selecting this command inserts this text into the input field
   * instead of executing a command. Useful for agent shortcuts.
   */
  insertText?: string
}

// Generate mode commands from the AGENT_MODES constant (excluded in Freebuff)
const MODE_COMMANDS: SlashCommand[] = IS_FREEBUFF
  ? []
  : AGENT_MODES.map((mode) => ({
      id: `mode:${mode.toLowerCase()}`,
      label: `mode:${mode.toLowerCase()}`,
      description: `Cambiar al modo ${mode}`,
      aliases: [`model:${mode.toLowerCase()}`],
    }))

const FREEBUFF_REMOVED_COMMAND_IDS = new Set([
  'login',
  'providers',
  'models',
  'setup-search',
  'usage',
  'config',
  'agent',
  'image',
  'publish',
  'init',
])

const FREEBUFF_ONLY_COMMAND_IDS = new Set(['connect', 'end-session'])

const ALL_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'login',
    label: 'login',
    description:
      'Configurar interactivamente un proveedor compatible con OpenAI',
    aliases: ['signin'],
  },
  {
    id: 'providers',
    label: 'providers',
    description: 'Administrar, editar, activar o eliminar proveedores',
    aliases: ['provider'],
  },
  {
    id: 'models',
    label: 'models',
    description: 'Seleccionar un modelo agrupado por proveedor',
    aliases: ['model'],
  },
  {
    id: 'setup-search',
    label: 'setup-search',
    description:
      'Configurar motores de búsqueda, proveedor predeterminado, respaldos y pruebas',
    aliases: ['search-setup', 'search'],
  },
  {
    id: 'usage',
    label: 'usage',
    description:
      'Mostrar estadísticas locales de tokens por sesión, agente y modelo',
    aliases: ['tokens', 'stats'],
  },
  {
    id: 'config',
    label: 'config',
    description: 'Configurar contexto persistente y commits verificados',
    aliases: ['settings'],
  },
  {
    id: 'help',
    label: 'help',
    description: 'Mostrar atajos de teclado y consejos',
    aliases: ['h', '?'],
    implicitCommand: true,
  },
  {
    id: 'diagnostics',
    label: 'diagnostics',
    description:
      'Mostrar el uso local de recursos del CLI y los procesos de herramientas de terminal',
    aliases: ['diag', 'processes'],
  },
  ...(CHATGPT_OAUTH_ENABLED
    ? [
        {
          id: 'connect',
          label: 'connect',
          description: 'Conectar tu cuenta de ChatGPT',
          aliases: ['connect:chatgpt', 'chatgpt'],
        },
      ]
    : []),

  {
    id: 'init',
    label: 'init',
    description: 'Inicializar knowledge.md, agentes y contexto/ cuando esté habilitado',
    implicitCommand: true,
  },
  // {
  //   id: 'undo',
  //   label: 'undo',
  //   description: 'Undo the last change made by the assistant',
  // },
  // {
  //   id: 'redo',
  //   label: 'redo',
  //   description: 'Redo the most recent undone change',
  // },
  {
    id: 'interview',
    label: 'interview',
    description:
      'La IA hace preguntas para convertir la solicitud en una especificación',
  },
  {
    id: 'review',
    label: 'review',
    description: 'Revisar cambios de código',
  },
  {
    id: 'new',
    label: 'new',
    description:
      'Borrar el historial de la conversación e iniciar un chat nuevo',
    aliases: ['n', 'clear', 'c', 'reset'],
    implicitCommand: true,
  },
  {
    id: 'compact',
    label: 'compact',
    description: 'Resumir la conversación y liberar espacio de contexto',
    implicitCommand: true,
  },
  {
    id: 'history',
    label: 'history',
    description: 'Explorar y reanudar conversaciones anteriores',
    aliases: ['chats'],
  },
  {
    id: 'rewind',
    label: 'rewind',
    description: 'Volver a un punto anterior del chat y restaurar archivos',
    aliases: ['restore'],
  },
  {
    id: 'rename',
    label: 'rename',
    description: 'Cambiar el nombre visible de la sesión actual',
    aliases: ['name'],
  },
  {
    id: 'export',
    label: 'export',
    description: 'Exportar el chat actual a un archivo portable de Codewolf',
  },
  {
    id: 'import',
    label: 'import',
    description: 'Importar y reanudar un chat exportado por Codewolf',
  },
  {
    id: 'copy',
    label: 'copy',
    description:
      'Copiar la conversación completa (mensajes y resultados de herramientas) al portapapeles',
    aliases: ['copy-chat'],
  },
  {
    id: 'agent',
    label: 'agent',
    description: 'Invocar un agente auxiliar con el proveedor y modelo activos',
    insertText: '@Agent ',
  },
  // {
  //   id: 'agent:opus',
  //   label: 'agent:opus',
  //   description: 'Spawn the Opus agent to help solve any problem',
  //   insertText: '@Opus Agent ',
  // },
  {
    id: 'feedback',
    label: 'feedback',
    description: IS_FREEBUFF
      ? 'Enviar comentarios generales sobre Freebuff'
      : 'Enviar comentarios generales sobre Codewolf',
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Entrar al modo Bash ("!" al inicio activa este modo)',
    aliases: ['!'],
  },
  {
    id: 'image',
    label: 'image',
    description:
      'Adjuntar una imagen (o usar Ctrl+V para pegarla desde el portapapeles)',
    aliases: ['img', 'attach'],
  },
  ...MODE_COMMANDS,
  // {
  //   id: 'publish',
  //   label: 'publish',
  //   description: 'Publish agents to the agent store',
  // },
  {
    id: 'theme:toggle',
    label: 'theme:toggle',
    description: 'Alternar entre modo claro y oscuro',
  },
  {
    id: 'end-session',
    label: 'end-session',
    description: 'Finalizar la sesión gratuita (permite cambiar de modelo)',
    aliases: ['model'],
  },
  {
    id: 'logout',
    label: 'logout',
    description: 'Cerrar la sesión actual',
    aliases: ['signout'],
    implicitCommand: true,
  },
  {
    id: 'exit',
    label: 'exit',
    description: 'Salir del CLI',
    aliases: ['quit', 'q'],
    implicitCommand: true,
  },
]

export const SLASH_COMMANDS = IS_FREEBUFF
  ? ALL_SLASH_COMMANDS.filter(
      (cmd) => !FREEBUFF_REMOVED_COMMAND_IDS.has(cmd.id),
    )
  : ALL_SLASH_COMMANDS.filter((cmd) => !FREEBUFF_ONLY_COMMAND_IDS.has(cmd.id))

export const SLASHLESS_COMMAND_IDS = new Set(
  SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand).map((cmd) =>
    cmd.id.toLowerCase(),
  ),
)

/** Maximum description length for skill commands in the slash menu */
const SKILL_MENU_DESCRIPTION_MAX_LENGTH = 50

function truncateDescription(description: string): string {
  if (description.length <= SKILL_MENU_DESCRIPTION_MAX_LENGTH) {
    return description
  }
  return description.slice(0, SKILL_MENU_DESCRIPTION_MAX_LENGTH - 1) + '…'
}

/**
 * Returns SLASH_COMMANDS merged with skill commands.
 * Skills become slash commands that users can invoke directly.
 */
export function getSlashCommandsWithSkills(skills: SkillsMap): SlashCommand[] {
  const skillCommands: SlashCommand[] = Object.values(skills).map((skill) => ({
    id: `skill:${skill.name}`,
    label: `skill:${skill.name}`,
    description: truncateDescription(skill.description),
  }))

  const commands = [...SLASH_COMMANDS, ...skillCommands]

  return commands
}
