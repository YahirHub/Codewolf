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

async function performAtomicAsyncWrite(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const tmpPath = tempPathFor(filePath)
  try {
    await fs.promises.writeFile(tmpPath, data)
    await fs.promises.rename(tmpPath, filePath)
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath)
    } catch {
      // Ignore cleanup errors; the original error is what matters
    }
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
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // Ignore cleanup errors; the original error is what matters
    }
    throw error
  }
}

/**
 * Async counterpart to writeFileAtomic. Used by the in-flight checkpoint writer
 * so serializing + flushing a multi-MB transcript doesn't block the CLI's
 * render/input thread. Same tmp-then-rename atomicity guarantee.
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
