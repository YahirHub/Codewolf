import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  ensureInitialProjectContext,
  maintainProjectContext,
} from '../project-context-maintenance'

import type { CodebuffClient, RunState } from '@codebuff/sdk'

const temporaryDirectories: string[] = []

function temporaryProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-context-write-'))
  temporaryDirectories.push(root)
  return root
}

const runState: RunState = {
  traceSessionId: 'context-test',
  output: {
    type: 'lastMessage',
    value: [{ role: 'assistant', content: 'Se completó el cambio.' }],
  },
}

const client = {
  run: async () => ({
    traceSessionId: 'writer-test',
    output: {
      type: 'structuredOutput' as const,
      value: {
        title: 'Actualizar módulo de prueba',
        objective: 'Documentar el cambio realizado.',
        decisions: ['Conservar la estructura existente.'],
        architecture: ['Se actualiza src/example.ts.'],
        libraries: [],
        problems: [],
        solutions: ['Se implementó el comportamiento solicitado.'],
        pending: ['Ejecutar las pruebas del proyecto.'],
        nextSteps: ['Validar el resultado.'],
        masterSummary: 'El módulo de prueba quedó actualizado.',
      },
    },
  }),
} as unknown as CodebuffClient

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('automatic project context maintenance', () => {
  test('creates a numbered record and updates the master after a code change', async () => {
    const projectRoot = temporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src/example.ts'), 'export {}')

    const result = await maintainProjectContext({
      projectRoot,
      client,
      changedPaths: ['src/example.ts'],
      runState,
    })

    expect(result.paths).toContain('contexto/000-contexto-maestro.md')
    expect(result.paths.some((entry) => /^contexto\/001-/.test(entry))).toBe(
      true,
    )
    expect(
      fs.readFileSync(
        path.join(projectRoot, 'contexto/000-contexto-maestro.md'),
        'utf8',
      ),
    ).toContain('Estado automático más reciente')
  })

  test('/init creates the master and a numbered initialization record', async () => {
    const projectRoot = temporaryProject()
    const initialized = await ensureInitialProjectContext({ projectRoot })

    const result = await maintainProjectContext({
      projectRoot,
      client,
      changedPaths: initialized,
      runState,
      forceInit: true,
    })

    expect(fs.existsSync(path.join(projectRoot, 'contexto'))).toBe(true)
    expect(result.paths).toContain('contexto/000-contexto-maestro.md')
    expect(result.paths.some((entry) => /^contexto\/001-/.test(entry))).toBe(
      true,
    )
  })

  test('creates a concise local record without spending another model call', async () => {
    const projectRoot = temporaryProject()
    const javaPath = 'app/src/main/java/com/thowilabs/wscanner/MainActivity.java'
    const iconPath = 'app/src/main/res/drawable/ic_stop.xml'
    fs.mkdirSync(path.join(projectRoot, path.dirname(javaPath)), {
      recursive: true,
    })
    fs.mkdirSync(path.join(projectRoot, path.dirname(iconPath)), {
      recursive: true,
    })
    fs.writeFileSync(path.join(projectRoot, javaPath), 'class MainActivity {}')
    fs.writeFileSync(path.join(projectRoot, iconPath), '<vector />')

    let clientCalls = 0
    const unusedClient = {
      run: async () => {
        clientCalls += 1
        throw new Error('The provider must not be called for a routine record')
      },
    } as unknown as CodebuffClient
    const detailedRunState: RunState = {
      traceSessionId: 'context-concise-test',
      output: {
        type: 'lastMessage',
        value: [
          {
            role: 'assistant',
            content: `The user's request is complete. Let me provide a summary of what was done.
## Resumen

**3 archivos modificados/creados:**

| Archivo | Cambio |
|---|---|
| MainActivity.java | Lógica del FAB rediseñada |

**Nuevo comportamiento del FAB:**
- **Normal**: icono radar cyan. Click → inicia escaneo.
- **Escaneando**: icono cuadrado rojo. Click → detiene el escaneo inmediatamente.
- **Al terminar**: vuelve al icono radar con el color correspondiente.

**Correcciones de edge cases:**
- onFinished ya no sobrescribe el estado de la UI si el usuario detuvo el escaneo manualmente.
- Long-press bloqueado durante el escaneo para evitar un segundo hilo solapado.`,
          },
        ],
      },
    }

    const result = await maintainProjectContext({
      projectRoot,
      client: unusedClient,
      changedPaths: [javaPath, iconPath],
      runState: detailedRunState,
    })

    expect(clientCalls).toBe(0)
    expect(result.usedFallback).toBe(false)
    const recordPath = result.paths.find((entry) => /^contexto\/001-/.test(entry))
    expect(recordPath).toBe(
      'contexto/001-permitir-detener-el-escaneo-activo.md',
    )
    const content = fs.readFileSync(path.join(projectRoot, recordPath!), 'utf8')
    expect(content).toContain('# 001 — Permitir detener el escaneo activo')
    expect(content).toContain(
      '- Escaneando: icono cuadrado rojo. Click → detiene el escaneo inmediatamente.',
    )
    expect(content).not.toContain("The user's request")
    expect(content).not.toContain('## Resumen')
    expect(content).not.toContain('No se registraron')
    expect(content).not.toContain('# Librerías usadas')
    expect(path.basename(recordPath!).length).toBeLessThanOrEqual(90)

    const master = fs.readFileSync(
      path.join(projectRoot, 'contexto/000-contexto-maestro.md'),
      'utf8',
    )
    expect(master).toContain('Resumen: Permitir detener el escaneo activo.')
    expect(master).not.toContain("The user's request")
  })


  test('derives filenames from technical evidence instead of the user request', async () => {
    const projectRoot = temporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src/bot.ts'), 'export {}')

    const result = await maintainProjectContext({
      projectRoot,
      client,
      changedPaths: ['src/bot.ts'],
      runState: {
        traceSessionId: 'technical-title-test',
        output: {
          type: 'lastMessage',
          value: [
            {
              role: 'assistant',
              content: `# Soluciones implementadas

- Función sendWithTyping(): activa composing, espera y termina en paused.
- Se aplicó a respuestas de comandos y mensajes del bot.`,
            },
          ],
        },
      },
    })

    const recordPath = result.paths.find((entry) => /^contexto\/001-/.test(entry))
    expect(recordPath).toBe(
      'contexto/001-implementar-simulacion-de-escritura.md',
    )
    const content = fs.readFileSync(path.join(projectRoot, recordPath!), 'utf8')
    expect(content).toContain('# 001 — Implementar simulación de escritura')
    expect(content).not.toContain('Ya funciona')
    expect(content).not.toContain('puedes hacer')
  })

  test('bounds long conversational titles and omits empty optional sections', async () => {
    const projectRoot = temporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src/example.ts'), 'export {}')

    const result = await maintainProjectContext({
      projectRoot,
      client,
      changedPaths: ['src/example.ts'],
      runState: {
        traceSessionId: 'bounded-title-test',
        output: {
          type: 'lastMessage',
          value: [{ role: 'assistant', content: 'Cambio completado.' }],
        },
      },
    })

    const recordPath = result.paths.find((entry) => /^contexto\/001-/.test(entry))
    expect(recordPath).toBeDefined()
    expect(path.basename(recordPath!).length).toBeLessThanOrEqual(90)
    const content = fs.readFileSync(path.join(projectRoot, recordPath!), 'utf8')
    const title = content.split('\n').find((line) => line.startsWith('# 001 — '))!
    expect(title.replace('# 001 — ', '').length).toBeLessThanOrEqual(72)
    expect(content).not.toContain('# Decisiones tomadas')
    expect(content).not.toContain('# Problemas encontrados')
    expect(content).not.toContain('No se registraron')
  })

  test('repairs low-quality legacy auto-context filenames from technical evidence', async () => {
    const projectRoot = temporaryProject()
    fs.mkdirSync(path.join(projectRoot, 'contexto'))
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src/next.ts'), 'export {}')
    fs.writeFileSync(
      path.join(
        projectRoot,
        'contexto/001-actualizar-implementacion-del-proyecto.md',
      ),
      `<!-- codewolf:auto-context:record -->
# 001 — Actualizar implementación del proyecto

# Fecha

2026-07-16

# Objetivo

Actualizar implementación del proyecto.

# Archivos importantes modificados

- src/bot.ts

# Soluciones implementadas

- makeWASocket con requestPairingCode para un bot de WhatsApp usando Baileys.
`,
    )

    const result = await maintainProjectContext({
      projectRoot,
      client,
      changedPaths: ['src/next.ts'],
      runState: {
        traceSessionId: 'legacy-context-repair',
        output: {
          type: 'lastMessage',
          value: [
            {
              role: 'assistant',
              content: '# Soluciones implementadas\n\n- Se actualizó next.ts.',
            },
          ],
        },
      },
    })

    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          'contexto/001-implementar-bot-de-whatsapp-con-baileys.md',
        ),
      ),
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          'contexto/001-actualizar-implementacion-del-proyecto.md',
        ),
      ),
    ).toBe(false)
    expect(result.paths).toContain(
      'contexto/001-implementar-bot-de-whatsapp-con-baileys.md',
    )
  })

})
