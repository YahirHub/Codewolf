import * as fs from 'fs'
import path from 'path'
import { createHash, randomUUID } from 'node:crypto'

import { stringifyJsonValue } from '@codebuff/common/util/json'

import { writeFileAtomic } from './write-file-atomic'

import type { ChatMessage } from '../types/chat'
import type { RunState } from '@codebuff/sdk'
import type { AgentState, AgentOutput } from '@codebuff/common/types/session-state'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const CHECKPOINT_VERSION = 1
const MAX_CHECKPOINTS = 100
const CHECKPOINT_DIRNAME = 'checkpoints'
const INDEX_FILENAME = 'index.json'
const JSON_OBJECTS_DIRNAME = 'objects'
const FILE_OBJECTS_DIRNAME = 'files'

export type RewindRestoreMode = 'conversation' | 'files' | 'both'

type FileSnapshot = {
  exists: boolean
  hash?: string
  objectId?: string
  mode?: number
}

type StoredRunState = {
  traceSessionId: string
  outputObjectId: string
  fileContextObjectId?: string
  mainAgentStateObjectId?: string
  messageObjectIds: string[]
}

export type RewindCheckpointSummary = {
  id: string
  createdAt: string
  prompt: string
  fileCount: number
}

type RewindCheckpoint = RewindCheckpointSummary & {
  uiMessageObjectIds: string[]
  runState?: StoredRunState
  files: Record<string, FileSnapshot>
}

type RewindIndex = {
  version: typeof CHECKPOINT_VERSION
  activeCheckpointId?: string
  checkpoints: RewindCheckpoint[]
  lastKnownFiles: Record<string, FileSnapshot>
}

export type RewindRestoreResult = {
  prompt: string
  messages?: ChatMessage[]
  runState?: RunState | null
  restoredFiles: string[]
  skippedFiles: Array<{ path: string; reason: string }>
}

type CheckpointContext = {
  chatDir: string
  projectRoot: string
}

type CreateCheckpointParams = CheckpointContext & {
  prompt: string
  messages: ChatMessage[]
  runState: RunState | null
}

type FileMutationParams = CheckpointContext & {
  filePath: string
}

type RestoreCheckpointParams = CheckpointContext & {
  checkpointId: string
  mode: RewindRestoreMode
}

const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(chatDir: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(chatDir) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)

  // Keep a rejection-safe tail in the queue. Returning `next` still exposes
  // the operation error to its caller, while the internal tail always settles
  // successfully and therefore cannot become an unhandled rejection.
  let tracked: Promise<void>
  const clearIfCurrent = () => {
    if (queues.get(chatDir) === tracked) queues.delete(chatDir)
  }
  tracked = next.then(clearIfCurrent, clearIfCurrent)
  queues.set(chatDir, tracked)
  return next
}

function getCheckpointRoot(chatDir: string): string {
  return path.join(chatDir, CHECKPOINT_DIRNAME)
}

function getIndexPath(chatDir: string): string {
  return path.join(getCheckpointRoot(chatDir), INDEX_FILENAME)
}

function emptyIndex(): RewindIndex {
  return { version: CHECKPOINT_VERSION, checkpoints: [], lastKnownFiles: {} }
}

function readIndex(chatDir: string): RewindIndex {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(getIndexPath(chatDir), 'utf8'),
    ) as Partial<RewindIndex>
    if (parsed.version !== CHECKPOINT_VERSION) return emptyIndex()
    return {
      version: CHECKPOINT_VERSION,
      activeCheckpointId: parsed.activeCheckpointId,
      checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
      lastKnownFiles:
        parsed.lastKnownFiles && typeof parsed.lastKnownFiles === 'object'
          ? parsed.lastKnownFiles
          : {},
    }
  } catch {
    return emptyIndex()
  }
}

function writeIndex(chatDir: string, index: RewindIndex): void {
  const root = getCheckpointRoot(chatDir)
  fs.mkdirSync(root, { recursive: true })
  writeFileAtomic(getIndexPath(chatDir), stringifyJsonValue(index))
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function storeJsonObject(chatDir: string, value: unknown): string {
  const serialized = stringifyJsonValue(value)
  const objectId = sha256(serialized)
  const dir = path.join(getCheckpointRoot(chatDir), JSON_OBJECTS_DIRNAME)
  const filePath = path.join(dir, `${objectId}.json`)
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(dir, { recursive: true })
    writeFileAtomic(filePath, serialized)
  }
  return objectId
}

function readJsonObject<T>(chatDir: string, objectId: string): T {
  const filePath = path.join(
    getCheckpointRoot(chatDir),
    JSON_OBJECTS_DIRNAME,
    `${objectId}.json`,
  )
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function storeFileObject(chatDir: string, content: Buffer): string {
  const objectId = sha256(content)
  const dir = path.join(getCheckpointRoot(chatDir), FILE_OBJECTS_DIRNAME)
  const filePath = path.join(dir, `${objectId}.bin`)
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(dir, { recursive: true })
    writeFileAtomic(filePath, content)
  }
  return objectId
}

function readFileObject(chatDir: string, objectId: string): Buffer {
  return fs.readFileSync(
    path.join(
      getCheckpointRoot(chatDir),
      FILE_OBJECTS_DIRNAME,
      `${objectId}.bin`,
    ),
  )
}

function isInsideDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

function resolveTrackedPath(projectRoot: string, filePath: string): {
  fullPath: string
  relativePath: string
} {
  const root = path.resolve(projectRoot)
  const fullPath = path.resolve(root, filePath)
  const relativePath = path.relative(root, fullPath).replaceAll('\\', '/')
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`La ruta está fuera del proyecto: ${filePath}`)
  }

  // Lexical containment is not enough: a path inside the repository can pass
  // through a symlink whose target lives outside it. Walk to the nearest
  // existing ancestor and validate its real path before snapshotting/restoring.
  const realRoot = fs.realpathSync(root)
  let existingAncestor = fullPath
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor)
    if (parent === existingAncestor) break
    existingAncestor = parent
  }
  const realAncestor = fs.realpathSync(existingAncestor)
  if (!isInsideDirectory(realRoot, realAncestor)) {
    throw new Error(`La ruta resuelve fuera del proyecto: ${filePath}`)
  }

  return { fullPath, relativePath }
}

function captureFileSnapshot(chatDir: string, fullPath: string): FileSnapshot {
  try {
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) return { exists: false }
    const content = fs.readFileSync(fullPath)
    const objectId = storeFileObject(chatDir, content)
    return {
      exists: true,
      objectId,
      hash: sha256(content),
      mode: stat.mode & 0o7777,
    }
  } catch {
    return { exists: false }
  }
}

function snapshotsEqual(a: FileSnapshot, b: FileSnapshot): boolean {
  if (a.exists !== b.exists) return false
  if (!a.exists) return true
  return a.hash === b.hash
}

function serializeRunState(
  chatDir: string,
  runState: RunState | null,
): StoredRunState | undefined {
  if (!runState) return undefined
  const mainAgentState = runState.sessionState?.mainAgentState
  const fileContext = runState.sessionState?.fileContext
  const messageObjectIds = (mainAgentState?.messageHistory ?? []).map((message) =>
    storeJsonObject(chatDir, message),
  )

  let mainAgentStateObjectId: string | undefined
  if (mainAgentState) {
    const compactState: AgentState = {
      ...mainAgentState,
      messageHistory: [],
      // Completed subagents are represented in the main history. Keeping their
      // full private histories would multiply checkpoint size and is not needed
      // to continue from the selected user prompt.
      subagents: [],
      childRunIds: [],
    }
    mainAgentStateObjectId = storeJsonObject(chatDir, compactState)
  }

  return {
    traceSessionId: runState.traceSessionId,
    outputObjectId: storeJsonObject(chatDir, runState.output),
    fileContextObjectId: fileContext
      ? storeJsonObject(chatDir, fileContext)
      : undefined,
    mainAgentStateObjectId,
    messageObjectIds,
  }
}

function deserializeRunState(
  chatDir: string,
  stored: StoredRunState | undefined,
): RunState | null {
  if (!stored) return null

  const output = readJsonObject<AgentOutput>(chatDir, stored.outputObjectId)
  if (!stored.fileContextObjectId || !stored.mainAgentStateObjectId) {
    return {
      traceSessionId: stored.traceSessionId,
      output,
    }
  }

  const fileContext = readJsonObject<ProjectFileContext>(
    chatDir,
    stored.fileContextObjectId,
  )
  const mainAgentState = readJsonObject<AgentState>(
    chatDir,
    stored.mainAgentStateObjectId,
  )
  const messageHistory = stored.messageObjectIds.map((objectId) =>
    readJsonObject<Message>(chatDir, objectId),
  )

  return {
    traceSessionId: stored.traceSessionId,
    output,
    sessionState: {
      fileContext,
      mainAgentState: {
        ...mainAgentState,
        messageHistory,
        subagents: [],
        childRunIds: [],
      },
    },
  }
}

function collectReferencedObjects(index: RewindIndex): {
  json: Set<string>
  files: Set<string>
} {
  const json = new Set<string>()
  const files = new Set<string>()
  const addSnapshot = (snapshot: FileSnapshot) => {
    if (snapshot.objectId) files.add(snapshot.objectId)
  }

  for (const checkpoint of index.checkpoints) {
    checkpoint.uiMessageObjectIds.forEach((id) => json.add(id))
    Object.values(checkpoint.files).forEach(addSnapshot)
    const runState = checkpoint.runState
    if (!runState) continue
    json.add(runState.outputObjectId)
    if (runState.fileContextObjectId) json.add(runState.fileContextObjectId)
    if (runState.mainAgentStateObjectId) json.add(runState.mainAgentStateObjectId)
    runState.messageObjectIds.forEach((id) => json.add(id))
  }
  Object.values(index.lastKnownFiles).forEach(addSnapshot)
  return { json, files }
}

function removeUnreferencedObjects(chatDir: string, index: RewindIndex): void {
  const references = collectReferencedObjects(index)
  const removeUnknown = (directory: string, suffix: string, keep: Set<string>) => {
    try {
      for (const name of fs.readdirSync(directory)) {
        if (!name.endsWith(suffix)) continue
        const objectId = name.slice(0, -suffix.length)
        if (!keep.has(objectId)) {
          fs.rmSync(path.join(directory, name), { force: true })
        }
      }
    } catch {
      // No objects of this type yet.
    }
  }
  removeUnknown(
    path.join(getCheckpointRoot(chatDir), JSON_OBJECTS_DIRNAME),
    '.json',
    references.json,
  )
  removeUnknown(
    path.join(getCheckpointRoot(chatDir), FILE_OBJECTS_DIRNAME),
    '.bin',
    references.files,
  )
}

export async function createRewindCheckpoint(
  params: CreateCheckpointParams,
): Promise<RewindCheckpointSummary> {
  return enqueue(params.chatDir, async () => {
    const index = readIndex(params.chatDir)
    const inheritedFiles: Record<string, FileSnapshot> = {}
    for (const relativePath of Object.keys(index.lastKnownFiles)) {
      try {
        const { fullPath } = resolveTrackedPath(params.projectRoot, relativePath)
        inheritedFiles[relativePath] = captureFileSnapshot(
          params.chatDir,
          fullPath,
        )
      } catch {
        // A previously tracked path can become invalid after a project move.
      }
    }

    const checkpoint: RewindCheckpoint = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: params.prompt.trim() || '(mensaje sin texto)',
      fileCount: Object.keys(inheritedFiles).length,
      uiMessageObjectIds: params.messages.map((message) =>
        storeJsonObject(params.chatDir, message),
      ),
      runState: serializeRunState(params.chatDir, params.runState),
      files: inheritedFiles,
    }

    index.checkpoints.push(checkpoint)
    index.activeCheckpointId = checkpoint.id
    if (index.checkpoints.length > MAX_CHECKPOINTS) {
      index.checkpoints.splice(0, index.checkpoints.length - MAX_CHECKPOINTS)
    }
    writeIndex(params.chatDir, index)
    removeUnreferencedObjects(params.chatDir, index)
    return {
      id: checkpoint.id,
      createdAt: checkpoint.createdAt,
      prompt: checkpoint.prompt,
      fileCount: checkpoint.fileCount,
    }
  })
}

export async function recordFileBeforeMutation(
  params: FileMutationParams,
): Promise<void> {
  await enqueue(params.chatDir, async () => {
    const index = readIndex(params.chatDir)
    const checkpoint =
      index.checkpoints.find((item) => item.id === index.activeCheckpointId) ??
      index.checkpoints.at(-1)
    if (!checkpoint) return

    const { fullPath, relativePath } = resolveTrackedPath(
      params.projectRoot,
      params.filePath,
    )
    if (!checkpoint.files[relativePath]) {
      checkpoint.files[relativePath] = captureFileSnapshot(
        params.chatDir,
        fullPath,
      )
      checkpoint.fileCount = Object.keys(checkpoint.files).length
      writeIndex(params.chatDir, index)
    }
  })
}

export async function recordFileAfterMutation(
  params: FileMutationParams,
): Promise<void> {
  await enqueue(params.chatDir, async () => {
    const index = readIndex(params.chatDir)
    const { fullPath, relativePath } = resolveTrackedPath(
      params.projectRoot,
      params.filePath,
    )
    index.lastKnownFiles[relativePath] = captureFileSnapshot(
      params.chatDir,
      fullPath,
    )
    writeIndex(params.chatDir, index)
  })
}

export async function listRewindCheckpoints(
  chatDir: string,
): Promise<RewindCheckpointSummary[]> {
  return enqueue(chatDir, async () =>
    readIndex(chatDir).checkpoints.map(({ id, createdAt, prompt, fileCount }) => ({
      id,
      createdAt,
      prompt,
      fileCount,
    })),
  )
}

function findTargetSnapshot(
  index: RewindIndex,
  targetIndex: number,
  relativePath: string,
): FileSnapshot | undefined {
  const direct = index.checkpoints[targetIndex]?.files[relativePath]
  if (direct) return direct
  for (let i = targetIndex + 1; i < index.checkpoints.length; i++) {
    const snapshot = index.checkpoints[i]?.files[relativePath]
    if (snapshot) return snapshot
  }
  return undefined
}

export async function restoreRewindCheckpoint(
  params: RestoreCheckpointParams,
): Promise<RewindRestoreResult> {
  return enqueue(params.chatDir, async () => {
    const index = readIndex(params.chatDir)
    const targetIndex = index.checkpoints.findIndex(
      (checkpoint) => checkpoint.id === params.checkpointId,
    )
    if (targetIndex < 0) throw new Error('El punto de restauración ya no existe.')
    const target = index.checkpoints[targetIndex]!

    const result: RewindRestoreResult = {
      prompt: target.prompt,
      restoredFiles: [],
      skippedFiles: [],
    }

    if (params.mode === 'conversation' || params.mode === 'both') {
      result.messages = target.uiMessageObjectIds.map((objectId) =>
        readJsonObject<ChatMessage>(params.chatDir, objectId),
      )
      result.runState = deserializeRunState(params.chatDir, target.runState)
    }

    if (params.mode === 'files' || params.mode === 'both') {
      const trackedPaths = new Set<string>()
      for (const checkpoint of index.checkpoints) {
        Object.keys(checkpoint.files).forEach((filePath) =>
          trackedPaths.add(filePath),
        )
      }
      Object.keys(index.lastKnownFiles).forEach((filePath) =>
        trackedPaths.add(filePath),
      )

      for (const relativePath of trackedPaths) {
        const targetSnapshot = findTargetSnapshot(
          index,
          targetIndex,
          relativePath,
        )
        if (!targetSnapshot) continue
        const { fullPath } = resolveTrackedPath(params.projectRoot, relativePath)
        const currentSnapshot = captureFileSnapshot(params.chatDir, fullPath)
        const lastKnown = index.lastKnownFiles[relativePath]
        if (lastKnown && !snapshotsEqual(currentSnapshot, lastKnown)) {
          result.skippedFiles.push({
            path: relativePath,
            reason: 'El archivo cambió fuera de las herramientas de Codewolf.',
          })
          continue
        }

        if (!targetSnapshot.exists) {
          fs.rmSync(fullPath, { force: true })
        } else if (targetSnapshot.objectId) {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true })
          writeFileAtomic(
            fullPath,
            readFileObject(params.chatDir, targetSnapshot.objectId),
          )
          if (targetSnapshot.mode !== undefined) {
            try {
              fs.chmodSync(fullPath, targetSnapshot.mode)
            } catch {
              // Some platforms/filesystems do not support chmod.
            }
          }
        }
        index.lastKnownFiles[relativePath] = targetSnapshot
        result.restoredFiles.push(relativePath)
      }
    }

    if (params.mode === 'conversation' || params.mode === 'both') {
      index.checkpoints = index.checkpoints.slice(0, targetIndex + 1)
      index.activeCheckpointId = target.id
    }

    writeIndex(params.chatDir, index)
    removeUnreferencedObjects(params.chatDir, index)
    return result
  })
}
