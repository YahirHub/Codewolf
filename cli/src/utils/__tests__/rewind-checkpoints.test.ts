import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  createRewindCheckpoint,
  listRewindCheckpoints,
  recordFileAfterMutation,
  recordFileBeforeMutation,
  restoreRewindCheckpoint,
} from '../rewind-checkpoints'

import type { ChatMessage } from '../../types/chat'
import type { RunState } from '@codebuff/sdk'

function message(id: string, content: string): ChatMessage {
  return {
    id,
    variant: 'user',
    content,
    timestamp: new Date().toISOString(),
    blocks: [{ type: 'text', content }],
  }
}

describe('rewind checkpoints', () => {
  let tempRoot: string
  let projectRoot: string
  let chatDir: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-rewind-'))
    projectRoot = path.join(tempRoot, 'project')
    chatDir = path.join(tempRoot, 'chat')
    fs.mkdirSync(projectRoot, { recursive: true })
    fs.mkdirSync(chatDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('restores conversation and files to the state before a selected prompt', async () => {
    const trackedFile = path.join(projectRoot, 'src', 'app.ts')
    fs.mkdirSync(path.dirname(trackedFile), { recursive: true })
    fs.writeFileSync(trackedFile, 'original\n')

    const initialRunState = {
      traceSessionId: 'trace-before-first-prompt',
      output: { type: 'error', message: 'checkpoint' },
    } as RunState
    const beforeMessages = [message('before', 'Conversación anterior')]
    const first = await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Primera solicitud',
      messages: beforeMessages,
      runState: initialRunState,
    })

    await recordFileBeforeMutation({
      chatDir,
      projectRoot,
      filePath: 'src/app.ts',
    })
    fs.writeFileSync(trackedFile, 'primera edición\n')
    await recordFileAfterMutation({
      chatDir,
      projectRoot,
      filePath: 'src/app.ts',
    })

    await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Segunda solicitud',
      messages: [message('after-first', 'Primera respuesta terminada')],
      runState: null,
    })

    await recordFileBeforeMutation({
      chatDir,
      projectRoot,
      filePath: 'src/new.ts',
    })
    fs.writeFileSync(path.join(projectRoot, 'src', 'new.ts'), 'nuevo\n')
    await recordFileAfterMutation({
      chatDir,
      projectRoot,
      filePath: 'src/new.ts',
    })

    await recordFileBeforeMutation({
      chatDir,
      projectRoot,
      filePath: 'src/app.ts',
    })
    fs.writeFileSync(trackedFile, 'segunda edición\n')
    await recordFileAfterMutation({
      chatDir,
      projectRoot,
      filePath: 'src/app.ts',
    })

    const result = await restoreRewindCheckpoint({
      chatDir,
      projectRoot,
      checkpointId: first.id,
      mode: 'both',
    })

    expect(result.prompt).toBe('Primera solicitud')
    expect(result.messages).toEqual(beforeMessages)
    expect(result.runState?.traceSessionId).toBe('trace-before-first-prompt')
    expect(fs.readFileSync(trackedFile, 'utf8')).toBe('original\n')
    expect(fs.existsSync(path.join(projectRoot, 'src', 'new.ts'))).toBe(false)
    expect(result.restoredFiles.sort()).toEqual(['src/app.ts', 'src/new.ts'])
    expect(result.skippedFiles).toEqual([])

    const remaining = await listRewindCheckpoints(chatDir)
    expect(remaining.map((item) => item.id)).toEqual([first.id])
  })

  test('conversation-only rewind leaves files unchanged', async () => {
    const trackedFile = path.join(projectRoot, 'file.txt')
    fs.writeFileSync(trackedFile, 'before')
    const beforeMessages = [message('m1', 'Antes')]
    const checkpoint = await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Cambia el archivo',
      messages: beforeMessages,
      runState: null,
    })
    await recordFileBeforeMutation({ chatDir, projectRoot, filePath: 'file.txt' })
    fs.writeFileSync(trackedFile, 'after')
    await recordFileAfterMutation({ chatDir, projectRoot, filePath: 'file.txt' })

    const result = await restoreRewindCheckpoint({
      chatDir,
      projectRoot,
      checkpointId: checkpoint.id,
      mode: 'conversation',
    })

    expect(result.messages).toEqual(beforeMessages)
    expect(fs.readFileSync(trackedFile, 'utf8')).toBe('after')
    expect(result.restoredFiles).toEqual([])
  })

  test('files-only rewind leaves conversation data out of the result', async () => {
    const trackedFile = path.join(projectRoot, 'file.txt')
    fs.writeFileSync(trackedFile, 'before')
    const checkpoint = await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Cambia el archivo',
      messages: [message('m1', 'Antes')],
      runState: null,
    })
    await recordFileBeforeMutation({ chatDir, projectRoot, filePath: 'file.txt' })
    fs.writeFileSync(trackedFile, 'after')
    await recordFileAfterMutation({ chatDir, projectRoot, filePath: 'file.txt' })

    const result = await restoreRewindCheckpoint({
      chatDir,
      projectRoot,
      checkpointId: checkpoint.id,
      mode: 'files',
    })

    expect(result.messages).toBeUndefined()
    expect(result.runState).toBeUndefined()
    expect(fs.readFileSync(trackedFile, 'utf8')).toBe('before')
  })

  test('does not overwrite a file changed outside Codewolf after the last edit', async () => {
    const trackedFile = path.join(projectRoot, 'file.txt')
    fs.writeFileSync(trackedFile, 'before')
    const checkpoint = await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Cambia el archivo',
      messages: [],
      runState: null,
    })
    await recordFileBeforeMutation({ chatDir, projectRoot, filePath: 'file.txt' })
    fs.writeFileSync(trackedFile, 'agent edit')
    await recordFileAfterMutation({ chatDir, projectRoot, filePath: 'file.txt' })

    fs.writeFileSync(trackedFile, 'manual edit')
    const result = await restoreRewindCheckpoint({
      chatDir,
      projectRoot,
      checkpointId: checkpoint.id,
      mode: 'files',
    })

    expect(fs.readFileSync(trackedFile, 'utf8')).toBe('manual edit')
    expect(result.restoredFiles).toEqual([])
    expect(result.skippedFiles).toEqual([
      {
        path: 'file.txt',
        reason: 'El archivo cambió fuera de las herramientas de Codewolf.',
      },
    ])
  })

  test('rejects paths outside the project, including symlink escapes', async () => {
    const checkpoint = await createRewindCheckpoint({
      chatDir,
      projectRoot,
      prompt: 'Prueba de rutas',
      messages: [],
      runState: null,
    })
    expect(checkpoint.id).toBeTruthy()

    let traversalError: unknown
    try {
      await recordFileBeforeMutation({
        chatDir,
        projectRoot,
        filePath: '../outside.txt',
      })
    } catch (error) {
      traversalError = error
    }
    expect(traversalError).toBeInstanceOf(Error)

    if (process.platform !== 'win32') {
      const outsideDir = path.join(tempRoot, 'outside')
      fs.mkdirSync(outsideDir)
      fs.symlinkSync(outsideDir, path.join(projectRoot, 'linked'))

      let symlinkError: unknown
      try {
        await recordFileBeforeMutation({
          chatDir,
          projectRoot,
          filePath: 'linked/secret.txt',
        })
      } catch (error) {
        symlinkError = error
      }
      expect(symlinkError).toBeInstanceOf(Error)
    }

    // A rejected operation must not poison the per-chat queue or leave an
    // unhandled rejection behind. Later checkpoint reads must still work.
    const checkpoints = await listRewindCheckpoints(chatDir)
    expect(checkpoints).toHaveLength(1)
  })

  test('keeps only the 100 most recent prompt checkpoints', async () => {
    for (let index = 0; index < 102; index++) {
      await createRewindCheckpoint({
        chatDir,
        projectRoot,
        prompt: `Prompt ${index}`,
        messages: [],
        runState: null,
      })
    }

    const checkpoints = await listRewindCheckpoints(chatDir)
    expect(checkpoints).toHaveLength(100)
    expect(checkpoints[0]?.prompt).toBe('Prompt 2')
    expect(checkpoints.at(-1)?.prompt).toBe('Prompt 101')
  })
})
