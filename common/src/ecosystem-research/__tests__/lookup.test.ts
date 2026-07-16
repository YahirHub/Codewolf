import { createHash } from 'crypto'
import { describe, expect, test } from 'bun:test'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { runEcosystemLookup } from '../lookup'

function createCacheDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'codewolf-ecosystem-research-'))
}


function listFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath))
    } else if (entry.isFile()) {
      files.push(filePath)
    }
  }
  return files
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('npm ecosystem lookup', () => {
  test('selects the latest stable dist-tag and returns compact risk metadata', async () => {
    const cacheDir = createCacheDir()
    const oversizedExports = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [
        `./feature-${index}`,
        `./dist/feature-${index}.js`,
      ]),
    )
    const fetchCalls: string[] = []
    const fetchMock = (async (input: string | URL | Request) => {
      fetchCalls.push(String(input))
      return jsonResponse({
        name: '@whiskeysockets/baileys',
        description: 'WhatsApp Web API',
        'dist-tags': { latest: '7.0.0', beta: '8.0.0-beta.1' },
        time: {
          modified: '2026-07-01T00:00:00.000Z',
          '7.0.0': '2026-06-20T00:00:00.000Z',
        },
        maintainers: [{ name: 'maintainer', email: 'dev@example.com' }],
        repository: {
          url: 'git+https://github.com/WhiskeySockets/Baileys.git',
        },
        readme: '# Baileys\nDocumentation',
        versions: {
          '7.0.0': {
            name: '@whiskeysockets/baileys',
            version: '7.0.0',
            description: 'WhatsApp Web API',
            license: 'MIT',
            engines: { node: '>=20' },
            types: './lib/Types/index.d.ts',
            exports: oversizedExports,
            dependencies: { pino: '^9.0.0', ws: '^8.0.0' },
            peerDependencies: { sharp: '^0.34.0' },
            optionalDependencies: { canvas: '^3.0.0' },
            scripts: {
              preinstall: 'node scripts/check-runtime.js',
              postinstall: 'node scripts/setup.js',
              test: 'vitest',
            },
            dist: {
              tarball:
                'https://registry.npmjs.org/@whiskeysockets/baileys/-/baileys-7.0.0.tgz',
              integrity: 'sha512-test',
            },
          },
          '8.0.0-beta.1': {
            name: '@whiskeysockets/baileys',
            version: '8.0.0-beta.1',
          },
        },
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'npm',
          operation: 'package',
          package: '@whiskeysockets/baileys',
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>

      expect(result.cached).toBe(false)
      expect(result.sourceUrl).toContain('%40whiskeysockets%2Fbaileys')
      expect(data.selectedVersion).toBe('7.0.0')
      expect(data.latestPublishedVersion).toBe('7.0.0')
      expect(data.latestPublishedIsPrerelease).toBe(false)
      expect(data.latestStableVersion).toBe('7.0.0')
      expect(data.selectedVersionIsPrerelease).toBe(false)
      expect(data.distTags.beta).toBe('8.0.0-beta.1')
      expect(data.engines).toEqual({ node: '>=20' })
      expect(data.lifecycleScripts).toEqual({
        preinstall: 'node scripts/check-runtime.js',
        postinstall: 'node scripts/setup.js',
      })
      expect(data.dependencies).toEqual({ count: 2, names: ['pino', 'ws'] })
      expect(data.peerDependencies.count).toBe(1)
      expect(data.exports).toBeTypeOf('string')
      expect(data.exports.length).toBeLessThanOrEqual(1_500)
      expect(fetchCalls).toHaveLength(1)
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('stores project research with readable language, registry, package and version paths', async () => {
    const cacheDir = createCacheDir()
    const fetchMock = (async () =>
      jsonResponse({
        name: '@whiskeysockets/baileys',
        'dist-tags': { latest: '7.0.0-rc13' },
        versions: {
          '7.0.0-rc13': {
            name: '@whiskeysockets/baileys',
            version: '7.0.0-rc13',
            license: 'MIT',
          },
        },
      })) as unknown as typeof globalThis.fetch

    try {
      await runEcosystemLookup(
        {
          ecosystem: 'npm',
          operation: 'package',
          package: '@whiskeysockets/baileys',
        },
        { fetch: fetchMock, cacheDir },
      )

      const files = listFiles(cacheDir)
      const normalized = files.map((file) => file.split(path.sep).join('/'))
      const markdownPath = files.find((file) => file.endsWith('.md'))

      expect(normalized.some((file) =>
        file.includes(
          '/nodejs/npm/@whiskeysockets/baileys/latest/package--7.0.0-rc13.json',
        ),
      )).toBe(true)
      expect(normalized.some((file) =>
        file.includes(
          '/nodejs/npm/@whiskeysockets/baileys/latest/package--7.0.0-rc13.md',
        ),
      )).toBe(true)
      expect(markdownPath).toBeDefined()
      expect(readFileSync(markdownPath!, 'utf8')).toContain(
        '# nodejs · npm · @whiskeysockets/baileys',
      )
      expect(readFileSync(markdownPath!, 'utf8')).toContain(
        '**Versión:** 7.0.0-rc13',
      )
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('distinguishes npm latest prereleases from the newest stable version', async () => {
    const cacheDir = createCacheDir()
    const fetchMock = (async () =>
      jsonResponse({
        name: '@whiskeysockets/baileys',
        'dist-tags': { latest: '7.0.0-rc13' },
        time: {
          '6.7.19': '2025-12-01T00:00:00.000Z',
          '7.0.0-rc13': '2026-07-01T00:00:00.000Z',
        },
        versions: {
          '6.7.19': { version: '6.7.19' },
          '7.0.0-rc13': { version: '7.0.0-rc13' },
        },
      })) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'npm',
          operation: 'package',
          package: '@whiskeysockets/baileys',
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>

      expect(data.latestPublishedVersion).toBe('7.0.0-rc13')
      expect(data.latestPublishedIsPrerelease).toBe(true)
      expect(data.latestStableVersion).toBe('6.7.19')
      expect(data.selectedVersion).toBe('7.0.0-rc13')
      expect(data.selectedVersionIsPrerelease).toBe(true)
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('extracts only focused README fragments and reuses the local cache', async () => {
    const cacheDir = createCacheDir()
    let fetchCount = 0
    const readme = [
      '# Package',
      'General introduction that is not needed.',
      '## Authentication',
      'Use useMultiFileAuthState to persist credentials.',
      'Listen for creds.update and save credentials immediately.',
      '## Other topic',
      'Unrelated details.',
    ].join('\n')
    const fetchMock = (async () => {
      fetchCount += 1
      return jsonResponse({
        name: '@whiskeysockets/baileys',
        readme,
        repository: 'https://github.com/WhiskeySockets/Baileys',
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const input = {
        ecosystem: 'npm' as const,
        operation: 'documentation' as const,
        package: '@whiskeysockets/baileys',
        topic: 'creds.update authentication',
      }
      const first = await runEcosystemLookup(input, {
        fetch: fetchMock,
        cacheDir,
      })
      const second = await runEcosystemLookup(input, {
        fetch: fetchMock,
        cacheDir,
      })
      const excerpt = (first.data as Record<string, string>).excerpt

      expect(excerpt).toContain('useMultiFileAuthState')
      expect(excerpt).toContain('creds.update')
      expect(excerpt.length).toBeLessThanOrEqual(6_000)
      expect(first.cached).toBe(false)
      expect(second.cached).toBe(true)
      expect(fetchCount).toBe(1)
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('migrates an old hashed global entry into the readable project cache', async () => {
    const projectCacheDir = createCacheDir()
    const legacyCacheDir = createCacheDir()
    const now = new Date('2026-07-16T00:00:00.000Z')
    const key = JSON.stringify({
      ecosystem: 'npm',
      operation: 'package',
      package: 'example-package',
      limit: 5,
    })
    const legacyPath = path.join(
      legacyCacheDir,
      `${createHash('sha256').update(key).digest('hex')}.json`,
    )
    writeFileSync(
      legacyPath,
      JSON.stringify({
        version: 1,
        key,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
        value: {
          ecosystem: 'npm',
          operation: 'package',
          sourceUrl: 'https://registry.npmjs.org/example-package',
          fetchedAt: now.toISOString(),
          data: {
            name: 'example-package',
            selectedVersion: '2.1.0',
          },
        },
      }),
    )
    let fetchCount = 0
    const fetchMock = (async () => {
      fetchCount += 1
      throw new Error('network should not be used')
    }) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'npm',
          operation: 'package',
          package: 'example-package',
        },
        {
          fetch: fetchMock,
          cacheDir: projectCacheDir,
          fallbackCacheDirs: [legacyCacheDir],
          now,
        },
      )

      expect(result.cached).toBe(true)
      expect(fetchCount).toBe(0)
      expect(listFiles(legacyCacheDir)).toEqual([])
      expect(
        listFiles(projectCacheDir)
          .map((file) => file.split(path.sep).join('/'))
          .some((file) =>
            file.includes(
              '/nodejs/npm/example-package/latest/package--2.1.0.md',
            ),
          ),
      ).toBe(true)
    } finally {
      rmSync(projectCacheDir, { recursive: true, force: true })
      rmSync(legacyCacheDir, { recursive: true, force: true })
    }
  })

  test('rejects unsupported npm symbol lookup without making a request', async () => {
    let fetchCount = 0
    const fetchMock = (async () => {
      fetchCount += 1
      return jsonResponse({})
    }) as unknown as typeof globalThis.fetch

    await expect(
      runEcosystemLookup(
        {
          ecosystem: 'npm',
          operation: 'symbols',
          package: 'example',
        },
        { fetch: fetchMock },
      ),
    ).rejects.toThrow('published package types')
    expect(fetchCount).toBe(0)
  })
})

describe('Go ecosystem lookup', () => {
  test('uses the official symbols endpoint with version, module, and a compact filter', async () => {
    const cacheDir = createCacheDir()
    let requestedUrl = ''
    const fetchMock = (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return jsonResponse({
        modulePath: 'github.com/go-chi/chi/v5',
        version: 'v5.2.2',
        symbols: {
          total: 1,
          items: [
            {
              name: 'NewRouter',
              kind: 'Function',
              synopsis: 'func NewRouter() *Mux',
              parent: 'Mux',
            },
          ],
        },
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'go',
          operation: 'symbols',
          package: 'github.com/go-chi/chi/v5',
          module: 'github.com/go-chi/chi/v5',
          version: 'v5.2.2',
          topic: 'NewRouter',
          limit: 3,
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>
      const url = new URL(requestedUrl)

      expect(url.pathname).toBe('/v1beta/symbols/github.com/go-chi/chi/v5')
      expect(url.searchParams.get('module')).toBe('github.com/go-chi/chi/v5')
      expect(url.searchParams.get('version')).toBe('v5.2.2')
      expect(url.searchParams.get('limit')).toBe('3')
      expect(url.searchParams.get('filter')).toBe('contains(name, "NewRouter")')
      expect(data.symbols[0]).toMatchObject({
        name: 'NewRouter',
        synopsis: 'func NewRouter() *Mux',
      })
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('maps vulnerability lookups to /v1beta/vulns and keeps compact security evidence', async () => {
    const cacheDir = createCacheDir()
    let requestedUrl = ''
    const fetchMock = (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return jsonResponse({
        total: 1,
        items: [
          {
            id: 'GO-2026-0001',
            summary: 'Example vulnerability',
            details: 'A'.repeat(3_000),
            aliases: ['CVE-2026-0001'],
            affected: [{ module: { path: 'example.com/mod' } }],
            references: [{ type: 'ADVISORY', url: 'https://vuln.go.dev' }],
          },
        ],
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'go',
          operation: 'vulnerabilities',
          package: 'example.com/mod/pkg',
          module: 'example.com/mod',
          version: 'v1.2.3',
          limit: 2,
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>
      const url = new URL(requestedUrl)

      expect(url.pathname).toBe('/v1beta/vulns/example.com/mod/pkg')
      expect(url.searchParams.get('module')).toBe('example.com/mod')
      expect(data.items[0].id).toBe('GO-2026-0001')
      expect(data.items[0].details.length).toBeLessThanOrEqual(1_500)
      expect(JSON.stringify(data.items[0].affected).length).toBeLessThanOrEqual(
        2_000,
      )
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })
})

describe('PyPI ecosystem lookup', () => {
  test('returns compact project metadata and distinguishes prerelease from stable', async () => {
    const cacheDir = createCacheDir()
    let requestedUrl = ''
    const fetchMock = (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return jsonResponse({
        info: {
          name: 'python-telegram-bot',
          version: '23.0.0rc1',
          summary: 'Telegram Bot API framework',
          requires_python: '>=3.10',
          requires_dist: [
            'httpx>=0.27,<0.29',
            'anyio>=4; extra == "rate-limiter"',
          ],
          license_expression: 'LGPL-3.0-or-later',
          project_urls: {
            Documentation: 'https://docs.python-telegram-bot.org/',
            Repository: 'https://github.com/python-telegram-bot/python-telegram-bot',
          },
          classifiers: ['Programming Language :: Python :: 3'],
        },
        releases: {
          '22.5': [
            {
              upload_time_iso_8601: '2026-05-01T00:00:00.000Z',
              yanked: false,
            },
          ],
          '23.0.0rc1': [
            {
              upload_time_iso_8601: '2026-07-01T00:00:00.000Z',
              yanked: false,
            },
          ],
        },
        urls: [
          {
            filename: 'python_telegram_bot-23.0.0rc1-py3-none-any.whl',
            packagetype: 'bdist_wheel',
            requires_python: '>=3.10',
            size: 1234,
            yanked: false,
            digests: { sha256: 'abc' },
          },
        ],
        vulnerabilities: [
          {
            id: 'PYSEC-2026-1',
            summary: 'Example issue',
            fixed_in: ['23.0.0rc2'],
          },
        ],
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'pypi',
          operation: 'package',
          package: 'python-telegram-bot',
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>

      expect(new URL(requestedUrl).pathname).toBe(
        '/pypi/python-telegram-bot/json',
      )
      expect(data.selectedVersion).toBe('23.0.0rc1')
      expect(data.selectedVersionIsPrerelease).toBe(true)
      expect(data.latestPublishedVersion).toBe('23.0.0rc1')
      expect(data.latestPublishedIsPrerelease).toBe(true)
      expect(data.latestStableVersion).toBe('22.5')
      expect(data.requiresPython).toBe('>=3.10')
      expect(data.dependencies).toEqual({
        count: 2,
        names: ['httpx', 'anyio'],
      })
      expect(data.documentation).toContain('docs.python-telegram-bot.org')
      expect(data.vulnerabilityCount).toBe(1)
      expect(data.files).toHaveLength(1)
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('uses exact-version JSON and extracts a focused project description', async () => {
    const cacheDir = createCacheDir()
    const fetchMock = (async () =>
      jsonResponse({
        info: {
          name: 'aiogram',
          version: '3.21.0',
          description: [
            '# aiogram',
            'General introduction.',
            '## Routers',
            'Router registers message and callback query handlers.',
            'Dispatcher includes routers and starts polling.',
          ].join('\n'),
          description_content_type: 'text/markdown',
          project_urls: {
            Documentation: 'https://docs.aiogram.dev/',
          },
        },
        urls: [],
        vulnerabilities: [],
      })) as unknown as typeof globalThis.fetch

    try {
      const result = await runEcosystemLookup(
        {
          ecosystem: 'pypi',
          operation: 'documentation',
          package: 'aiogram',
          version: '3.21.0',
          topic: 'Router Dispatcher polling',
        },
        { fetch: fetchMock, cacheDir },
      )
      const data = result.data as Record<string, any>

      expect(result.sourceUrl).toContain('/pypi/aiogram/3.21.0/json')
      expect(data.excerpt).toContain('Router registers')
      expect(data.excerpt).toContain('starts polling')
      expect(data.contentType).toBe('text/markdown')
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  test('explains that candidate discovery uses focused web search', async () => {
    await expect(
      runEcosystemLookup({
        ecosystem: 'pypi',
        operation: 'search',
        query: 'telegram bot',
      }),
    ).rejects.toThrow('does not provide a structured full-text search API')
  })
})
