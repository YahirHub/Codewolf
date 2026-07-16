import * as fs from 'fs'
import { randomUUID } from 'node:crypto'

// Unique per-write temp suffix. A plain `${pid}.tmp` collides when a sync
// exit-flush and an async checkpoint write target the same file concurrently
// (both share the pid): they'd write and rename the SAME temp path, tearing
// each other's output. A random component makes every write self-contained.
function tempPathFor(filePath: string): string {
  return `${filePath}.${process.pid}.${randomUUID()}.tmp`
}

const pendingAsyncWrites = new Map<string, Promise<void>>()
const REPLACE_RETRY_DELAYS_MS = [0, 50, 150, 300, 600] as const
const TRANSIENT_REPLACE_ERROR_CODES = new Set([
  'EPERM',
  'EACCES',
  'EBUSY',
  'ETXTBSY',
])

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined
}

export function isTransientFileLockError(error: unknown): boolean {
  const code = errorCode(error)
  return code !== undefined && TRANSIENT_REPLACE_ERROR_CODES.has(code)
}

function sleepSync(milliseconds: number): void {
  if (milliseconds <= 0) return
  const signal = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  )
  Atomics.wait(signal, 0, 0, milliseconds)
}

function sleep(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function targetCanBeCopiedOver(filePath: string): boolean {
  try {
    return !fs.statSync(filePath).isDirectory()
  } catch (error) {
    return errorCode(error) === 'ENOENT'
  }
}

async function targetCanBeCopiedOverAsync(filePath: string): Promise<boolean> {
  try {
    return !(await fs.promises.stat(filePath)).isDirectory()
  } catch (error) {
    return errorCode(error) === 'ENOENT'
  }
}

function makeTargetWritable(filePath: string): void {
  if (process.platform !== 'win32') return
  try {
    if (fs.existsSync(filePath)) fs.chmodSync(filePath, 0o666)
  } catch {
    // The following replace/copy attempt will report the real error.
  }
}

async function makeTargetWritableAsync(filePath: string): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await fs.promises.chmod(filePath, 0o666)
  } catch {
    // Missing targets and unsupported chmod are both safe to ignore here.
  }
}

function cleanupTempSync(tmpPath: string): void {
  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    sleepSync(delayMs)
    try {
      fs.unlinkSync(tmpPath)
      return
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return
      if (!isTransientFileLockError(error)) return
    }
  }
}

async function cleanupTempAsync(tmpPath: string): Promise<void> {
  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    await sleep(delayMs)
    try {
      await fs.promises.unlink(tmpPath)
      return
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return
      if (!isTransientFileLockError(error)) return
    }
  }
}

/**
 * Windows may reject rename(temp, target) with EPERM/EACCES while an editor,
 * TypeScript watcher or antivirus briefly holds the destination. Retry the
 * atomic rename first. When Windows refuses replacing an existing regular file
 * but still allows writing it, copy the complete temporary file over it as a
 * best-effort fallback instead of aborting rewind/chat persistence.
 */
function replaceTempFileSync(tmpPath: string, filePath: string): void {
  let lastError: unknown

  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    sleepSync(delayMs)
    try {
      fs.renameSync(tmpPath, filePath)
      return
    } catch (error) {
      lastError = error
      if (!isTransientFileLockError(error)) throw error
      if (!targetCanBeCopiedOver(filePath)) throw error

      makeTargetWritable(filePath)
      try {
        fs.copyFileSync(tmpPath, filePath)
        cleanupTempSync(tmpPath)
        return
      } catch (copyError) {
        lastError = copyError
        if (!isTransientFileLockError(copyError)) throw copyError
      }
    }
  }

  throw lastError
}

async function replaceTempFileAsync(
  tmpPath: string,
  filePath: string,
): Promise<void> {
  let lastError: unknown

  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    await sleep(delayMs)
    try {
      await fs.promises.rename(tmpPath, filePath)
      return
    } catch (error) {
      lastError = error
      if (!isTransientFileLockError(error)) throw error
      if (!(await targetCanBeCopiedOverAsync(filePath))) throw error

      await makeTargetWritableAsync(filePath)
      try {
        await fs.promises.copyFile(tmpPath, filePath)
        await cleanupTempAsync(tmpPath)
        return
      } catch (copyError) {
        lastError = copyError
        if (!isTransientFileLockError(copyError)) throw copyError
      }
    }
  }

  throw lastError
}

async function performAtomicAsyncWrite(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const tmpPath = tempPathFor(filePath)
  try {
    await fs.promises.writeFile(tmpPath, data)
    await replaceTempFileAsync(tmpPath, filePath)
  } catch (error) {
    await cleanupTempAsync(tmpPath)
    throw error
  }
}

/**
 * Write a file atomically: write to a temp file in the same directory, then
 * rename over the target. Chat files grow to multiple MB and are rewritten on
 * every agent step, so a plain writeFileSync interrupted by a crash/kill
 * leaves truncated JSON that hides the chat from /history.
 */
export function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
): void {
  const tmpPath = tempPathFor(filePath)
  try {
    fs.writeFileSync(tmpPath, data)
    replaceTempFileSync(tmpPath, filePath)
  } catch (error) {
    cleanupTempSync(tmpPath)
    throw error
  }
}

/**
 * Async counterpart to writeFileAtomic. Used by the in-flight checkpoint writer
 * so serializing + flushing a multi-MB transcript doesn't block the CLI's
 * render/input thread. Same tmp-then-rename atomicity guarantee, with a Windows
 * fallback for temporarily locked destinations.
 */
export function writeFileAtomicAsync(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const previous = pendingAsyncWrites.get(filePath) ?? Promise.resolve()
  const current = previous
    .catch(() => {
      // A failed write must not poison future writes to the same file.
    })
    .then(() => performAtomicAsyncWrite(filePath, data))

  pendingAsyncWrites.set(filePath, current)
  void current
    .finally(() => {
      if (pendingAsyncWrites.get(filePath) === current) {
        pendingAsyncWrites.delete(filePath)
      }
    })
    .catch(() => {
      // The returned promise is observed by the caller. This cleanup branch
      // only consumes the promise created by finally().
    })
  return current
}
