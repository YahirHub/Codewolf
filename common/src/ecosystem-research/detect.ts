import type { FileTreeNode, ProjectFileContext } from '../util/file'

export type DetectedProjectEcosystem =
  | 'npm'
  | 'pypi'
  | 'go'
  | 'rust'
  | 'nuget'
  | 'maven'
  | 'packagist'

const MANIFEST_ECOSYSTEMS: Array<{
  ecosystem: DetectedProjectEcosystem
  names: Set<string>
  patterns?: RegExp[]
}> = [
  {
    ecosystem: 'npm',
    names: new Set([
      'package.json',
      'bun.lock',
      'bun.lockb',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
  },
  {
    ecosystem: 'pypi',
    names: new Set([
      'pyproject.toml',
      'poetry.lock',
      'uv.lock',
      'pipfile',
      'pipfile.lock',
      'setup.py',
      'setup.cfg',
    ]),
    patterns: [/^requirements(?:[._-].+)?\.txt$/i],
  },
  { ecosystem: 'go', names: new Set(['go.mod', 'go.sum']) },
  {
    ecosystem: 'rust',
    names: new Set(['cargo.toml', 'cargo.lock']),
  },
  {
    ecosystem: 'nuget',
    names: new Set([
      'global.json',
      'directory.packages.props',
      'packages.config',
    ]),
    patterns: [/\.(?:csproj|fsproj|vbproj|sln|slnx)$/i],
  },
  {
    ecosystem: 'maven',
    names: new Set([
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'settings.gradle.kts',
    ]),
  },
  {
    ecosystem: 'packagist',
    names: new Set(['composer.json', 'composer.lock']),
  },
]

const PROMPT_PATTERNS: Array<{
  ecosystem: DetectedProjectEcosystem
  patterns: RegExp[]
}> = [
  {
    ecosystem: 'npm',
    patterns: [
      /\b(node(?:\.js)?|nodejs|javascript|typescript|bun|npm|pnpm|yarn)\b/i,
    ],
  },
  {
    ecosystem: 'pypi',
    patterns: [
      /\b(python|python3|pip|pypi|poetry|pytest|django|fastapi|flask)\b/i,
    ],
  },
  {
    ecosystem: 'go',
    patterns: [/\b(golang|go module|go package|lenguaje go|en go)\b/i],
  },
  { ecosystem: 'rust', patterns: [/\b(rust|cargo|crate|crates\.io)\b/i] },
  {
    ecosystem: 'nuget',
    patterns: [/\b(c#|csharp|\.net|dotnet|asp\.net|aspnet|nuget)\b/i],
  },
  {
    ecosystem: 'maven',
    patterns: [/\b(java|kotlin|gradle|maven|spring boot|springboot)\b/i],
  },
  {
    ecosystem: 'packagist',
    patterns: [/\b(php|composer|laravel|symfony|packagist)\b/i],
  },
]

function collectFileNames(nodes: FileTreeNode[], target: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'file') target.add(node.name.toLowerCase())
    if (node.children) collectFileNames(node.children, target)
  }
}

function hasManifestSignal(
  mapping: (typeof MANIFEST_ECOSYSTEMS)[number],
  fileNames: Set<string>,
): boolean {
  for (const fileName of fileNames) {
    if (mapping.names.has(fileName)) return true
    if (mapping.patterns?.some((pattern) => pattern.test(fileName))) return true
  }
  return false
}

export function detectProjectEcosystems(params: {
  fileContext: ProjectFileContext
  prompt?: string
}): DetectedProjectEcosystem[] {
  const detected = new Set<DetectedProjectEcosystem>()
  const fileNames = new Set<string>()
  collectFileNames(params.fileContext.fileTree, fileNames)

  for (const mapping of MANIFEST_ECOSYSTEMS) {
    if (hasManifestSignal(mapping, fileNames)) {
      detected.add(mapping.ecosystem)
    }
  }

  const prompt = params.prompt?.trim() ?? ''
  for (const mapping of PROMPT_PATTERNS) {
    if (mapping.patterns.some((pattern) => pattern.test(prompt))) {
      detected.add(mapping.ecosystem)
    }
  }

  return [...detected]
}

export function getEcosystemDelegationPrompt(params: {
  fileContext: ProjectFileContext
  prompt?: string
}): string {
  const ecosystems = detectProjectEcosystems(params)
  if (ecosystems.length === 0) return ''

  const structured = ecosystems.filter((ecosystem) =>
    ['npm', 'pypi', 'go'].includes(ecosystem),
  )
  const fallback = ecosystems.filter(
    (ecosystem) => !structured.includes(ecosystem),
  )

  return `
# Automatic ecosystem research routing

Detected ecosystem signals: ${ecosystems.join(', ')}.

The user does not need to know package registries, documentation sites, or research-agent names. Translate ordinary requests into the correct research workflow yourself.
${
  structured.length > 0
    ? `- For ${structured.join(', ')} dependencies whose current version, API, compatibility, maintenance, or security matters, spawn ecosystem-researcher first with a focused mission. It resolves npm, PyPI, and Go metadata and returns only a compact brief.`
    : ''
}
${
  fallback.length > 0
    ? `- For ${fallback.join(', ')} dependencies, use one focused documentation researcher first and a web researcher only for one concrete unresolved gap.`
    : ''
}
- Infer the ecosystem from project manifests and ordinary language such as "haz un bot de Telegram en Python".
- Do not ask the user which registry, website, library researcher, or subagent to use.
- Do not launch duplicate researchers for the same package in parallel.
- Wait for the primary research result before choosing a fallback.
- Skip external research for purely local code or when no third-party API/version decision is involved.
`.trim()
}
