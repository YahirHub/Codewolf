import { createRequire } from 'module'

import { Argument, Command } from 'commander'

import type { AgentMode } from './utils/constants'
import { getCliEnv } from './utils/env'

const require = createRequire(import.meta.url)

const COMMANDER_HELP_TITLES: Record<string, string> = {
  'Usage:': 'Uso:',
  'Arguments:': 'Argumentos:',
  'Options:': 'Opciones:',
  'Commands:': 'Comandos:',
}

function localizeCommanderError(message: string): string {
  return message
    .replace(/^error: unknown option /m, 'error: opción desconocida ')
    .replace(/^error: too many arguments\./m, 'error: demasiados argumentos.')
    .replace(
      /^error: missing required argument /m,
      'error: falta el argumento obligatorio ',
    )
    .replace(
      /^error: required option (.+) not specified$/m,
      'error: no se indicó la opción obligatoria $1',
    )
    .replace(
      /^error: option (.+) argument missing$/m,
      'error: falta el argumento de la opción $1',
    )
    .replace(
      /^error: command (.+) not found$/m,
      'error: no se encontró el comando $1',
    )
    .replace(/Did you mean (.+)\?/g, '¿Quisiste decir $1?')
}

function configureSpanishCommanderOutput(program: Command): void {
  program.configureHelp({
    styleTitle: (title) => COMMANDER_HELP_TITLES[title] ?? title,
  })
  program.configureOutput({
    outputError: (message, write) => write(localizeCommanderError(message)),
  })
}

export type ParsedArgs = {
  initialPrompt: string | null
  command?: string
  commandArgs: string[]
  agent?: string
  clearLogs: boolean
  continue: boolean
  continueId?: string | null
  cwd?: string
  initialMode?: AgentMode
}

export function loadPackageVersion(): string {
  const env = getCliEnv()
  if (env.CODEBUFF_CLI_VERSION) {
    return env.CODEBUFF_CLI_VERSION
  }

  try {
    const pkg = require('../package.json') as { version?: string }
    if (pkg.version) {
      return pkg.version
    }
  } catch {
    // Continue to dev fallback
  }

  return 'dev'
}

export function parseArgs({
  argv = process.argv,
  version = loadPackageVersion(),
}: {
  argv?: string[]
  version?: string
} = {}): ParsedArgs {
  const program = new Command()
  configureSpanishCommanderOutput(program)

  program
    .name('codewolf')
    .description('Codewolf CLI - Asistente de programación con IA')
    .version(version, '-v, --version', 'Mostrar la versión del CLI')
    .option(
      '--agent <agent-id>',
      'Ejecutar un agente específico (omite las personalizaciones locales de .agents)',
    )
    .option(
      '--clear-logs',
      'Eliminar los registros existentes del CLI antes de iniciar',
    )
    .option(
      '--continue [conversation-id]',
      'Continuar una conversación anterior (opcionalmente indica su identificador)',
    )
    .option(
      '--cwd <directory>',
      'Establecer el directorio de trabajo (predeterminado: directorio actual)',
    )
    .option('--lite', 'Iniciar en modo LITE')
    .option('--free', 'Iniciar en modo LITE (alias obsoleto)')
    .option('--max', 'Iniciar en modo MAX')
    .option('--plan', 'Iniciar en modo PLAN')
    .addHelpText(
      'after',
      '\nComandos:\n  login                          Iniciar sesión en tu cuenta\n  publish                        Publicar agentes en el registro',
    )
    .helpOption('-h, --help', 'Mostrar este mensaje de ayuda')
    .argument('[prompt...]', 'Solicitud inicial que se enviará al agente')
    .allowExcessArguments(true)

  program.parse(argv)

  const options = program.opts()
  const args = program.args
  const continueFlag = options.continue

  let initialMode: AgentMode | undefined
  if (options.free || options.lite) initialMode = 'LITE'
  if (options.max) initialMode = 'MAX'
  if (options.plan) initialMode = 'PLAN'

  const standaloneCommand = ['login', 'publish'].includes(args[0] ?? '')

  return {
    initialPrompt:
      args.length > 0 && !standaloneCommand ? args.join(' ') : null,
    command: args[0],
    commandArgs: standaloneCommand ? args.slice(1) : [],
    agent: options.agent,
    clearLogs: options.clearLogs || false,
    continue: Boolean(continueFlag),
    continueId:
      typeof continueFlag === 'string' && continueFlag.trim().length > 0
        ? continueFlag.trim()
        : null,
    cwd: options.cwd,
    initialMode,
  }
}
