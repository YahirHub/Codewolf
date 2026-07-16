import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { writeFileAtomic, writeFileAtomicAsync } from '../write-file-atomic'

let tempDir = ''

describe('writeFileAtomic', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('writes a new file', () => {
    const target = path.join(tempDir, 'out.json')

    writeFileAtomic(target, '{"a":1}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}')
  })

  test('writes binary content atomically', () => {
    const target = path.join(tempDir, 'blob.bin')
    const content = new Uint8Array([0, 1, 2, 255])

    writeFileAtomic(target, content)

    expect([...fs.readFileSync(target)]).toEqual([...content])
  })

  test('replaces an existing file', () => {
    const target = path.join(tempDir, 'out.json')
    fs.writeFileSync(target, 'old content')

    writeFileAtomic(target, 'new content')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
  })

  test('falls back to copying the complete temp file when Windows rejects rename', () => {
    const target = path.join(tempDir, 'locked-by-watcher.ts')
    fs.writeFileSync(target, 'old content')
    const originalRenameSync = fs.renameSync
    const renameSpy = spyOn(fs, 'renameSync').mockImplementation(
      (source, destination) => {
        if (path.resolve(String(destination)) === path.resolve(target)) {
          const error = new Error(
            'EPERM: operation not permitted, rename',
          ) as NodeJS.ErrnoException
          error.code = 'EPERM'
          throw error
        }
        return originalRenameSync(source, destination)
      },
    )

    try {
      writeFileAtomic(target, 'restored content')
    } finally {
      renameSpy.mockRestore()
    }

    expect(fs.readFileSync(target, 'utf8')).toBe('restored content')
    expect(fs.readdirSync(tempDir)).toEqual(['locked-by-watcher.ts'])
  })

  test('leaves no temp file behind on success', () => {
    const target = path.join(tempDir, 'out.json')

    writeFileAtomic(target, 'data')

    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })

  test('cleans up the temp file and rethrows on failure', () => {
    // Renaming a file over an existing directory fails on all platforms
    const target = path.join(tempDir, 'target-dir')
    fs.mkdirSync(target)

    expect(() => writeFileAtomic(target, 'data')).toThrow()

    expect(fs.readdirSync(tempDir)).toEqual(['target-dir'])
  })

  test('uses a unique temp name per write (no collision between calls)', () => {
    // Two writes to different targets must not share a temp path, otherwise
    // concurrent sync + async writes would tear each other. The temp name
    // includes a random component, so back-to-back writes never collide.
    const a = path.join(tempDir, 'a.json')
    const b = path.join(tempDir, 'b.json')

    writeFileAtomic(a, 'a')
    writeFileAtomic(b, 'b')

    expect(fs.readdirSync(tempDir).sort()).toEqual(['a.json', 'b.json'])
  })
})

describe('writeFileAtomicAsync', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-atomic-async-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('writes a new file', async () => {
    const target = path.join(tempDir, 'out.json')

    await writeFileAtomicAsync(target, '{"a":1}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}')
  })

  test('replaces an existing file', async () => {
    const target = path.join(tempDir, 'out.json')
    fs.writeFileSync(target, 'old content')

    await writeFileAtomicAsync(target, 'new content')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
  })

  test('falls back asynchronously when replacing an existing file returns EPERM', async () => {
    const target = path.join(tempDir, 'locked-by-antivirus.ts')
    fs.writeFileSync(target, 'old content')
    const originalRename = fs.promises.rename.bind(fs.promises)
    const renameSpy = spyOn(fs.promises, 'rename').mockImplementation(
      async (source, destination) => {
        if (path.resolve(String(destination)) === path.resolve(target)) {
          const error = new Error(
            'EPERM: operation not permitted, rename',
          ) as NodeJS.ErrnoException
          error.code = 'EPERM'
          throw error
        }
        await originalRename(source, destination)
      },
    )

    try {
      await writeFileAtomicAsync(target, 'restored content')
    } finally {
      renameSpy.mockRestore()
    }

    expect(fs.readFileSync(target, 'utf8')).toBe('restored content')
    expect(fs.readdirSync(tempDir)).toEqual(['locked-by-antivirus.ts'])
  })

  test('leaves no temp file behind on success', async () => {
    const target = path.join(tempDir, 'out.json')

    await writeFileAtomicAsync(target, 'data')

    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })

  test('cleans up the temp file and rejects on failure', async () => {
    const target = path.join(tempDir, 'target-dir')
    fs.mkdirSync(target)

    await expect(writeFileAtomicAsync(target, 'data')).rejects.toThrow()

    expect(fs.readdirSync(tempDir)).toEqual(['target-dir'])
  })

  test('concurrent writes to the same file do not tear (last write wins)', async () => {
    const target = path.join(tempDir, 'out.json')

    await Promise.all([
      writeFileAtomicAsync(target, 'first'),
      writeFileAtomicAsync(target, 'second'),
      writeFileAtomicAsync(target, 'third'),
    ])

    // Writes are serialized per target, so invocation order is preserved and
    // the final value is never a torn mix.
    expect(fs.readFileSync(target, 'utf8')).toBe('third')
    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })
})
