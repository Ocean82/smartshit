/// <reference lib="webworker" />

/**
 * NLP Engine Web Worker
 *
 * Runs the WASM-based NLP inference pipeline off the main thread.
 * Implements a state machine for lifecycle management:
 *   Loading → Ready (model loaded + validated)
 *   Loading → Retrying (load failed, 1st attempt)
 *   Retrying → Ready (retry succeeded)
 *   Retrying → Fallback (retry failed)
 *   Fallback → Ready (lazy reload succeeds later)
 *   Ready → Updating (new model version detected)
 *   Updating → Ready (update validated OR update failed, retain old)
 *
 * Communication: receives NLPWorkerRequest, posts NLPWorkerResponse.
 *
 * @module nlpWorker
 */

import type {
  NLPEngineState,
  NLPWorkerRequest,
  NLPWorkerResponse,
  ClassificationResult,
  MacroPlan,
  WorkbookContext,
  NLPConfig,
} from './types'
import { createModelManager, validateChecksum } from './modelManager'

// ─── Constants ──────────────────────────────────────────────────────────────

const INIT_TIMEOUT_MS = 10_000

// ─── Worker State ───────────────────────────────────────────────────────────

let state: NLPEngineState = 'loading'
let modelData: ArrayBuffer | null = null
let initAttempts = 0
const pendingOperations = new Map<string, { cancel: () => void }>()

// Default config — will be set properly during init if needed
const defaultConfig: NLPConfig = {
  modelBaseUrl: '/models/nlp/',
  bundledModelVersion: '1.0.0',
  fallbackThreshold: 0.6,
  initTimeoutMs: INIT_TIMEOUT_MS,
  maxRetries: 1,
  maxMacroSteps: 5,
  inferenceTimeoutMs: 500,
}

const modelManager = createModelManager(defaultConfig)

// ─── State Management ───────────────────────────────────────────────────────

function setState(newState: NLPEngineState): void {
  state = newState
  postResponse({ type: 'stateChange', state: newState })
}

function postResponse(response: NLPWorkerResponse): void {
  self.postMessage(response)
}

// ─── Model Loading ──────────────────────────────────────────────────────────

/**
 * Attempts to load the model with a timeout.
 * Returns the model ArrayBuffer on success, or throws on failure/timeout.
 */
async function loadModelWithTimeout(
  modelUrl: string,
  checksum: string
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Model initialization timed out'))
    }, INIT_TIMEOUT_MS)

    loadModel(modelUrl, checksum)
      .then((data) => {
        clearTimeout(timeoutId)
        resolve(data)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

/**
 * Loads the model using the ModelManager fallback chain:
 * 1. Try getCachedModel()
 * 2. Try downloadAndValidate()
 * 3. Fall back to getBundledModel()
 */
async function loadModel(
  modelUrl: string,
  checksum: string
): Promise<ArrayBuffer> {
  // 1. Try cached model first
  const cached = await modelManager.getCachedModel()
  if (cached) {
    // Validate cached model checksum
    const isValid = await validateChecksum(cached, checksum)
    if (isValid) {
      return cached
    }
    // Cached model has wrong checksum — re-download
  }

  // 2. Try downloading and validating from CDN
  try {
    const manifest = { version: 'latest', url: modelUrl, checksum, size: 0 }
    const downloaded = await modelManager.downloadAndValidate(manifest)
    return downloaded
  } catch {
    // Download failed — fall through to bundled
  }

  // 3. Fall back to bundled model
  return modelManager.getBundledModel()
}

// ─── Message Handlers ───────────────────────────────────────────────────────

async function handleInit(modelUrl: string, checksum: string): Promise<void> {
  setState('loading')
  initAttempts = 0

  try {
    initAttempts = 1
    modelData = await loadModelWithTimeout(modelUrl, checksum)
    setState('ready')
  } catch {
    // First attempt failed — retry once
    try {
      initAttempts = 2
      // Transition to retrying state (internal, not in the type union as a separate post)
      // The design shows Loading → Retrying → Ready/Fallback
      modelData = await loadModelWithTimeout(modelUrl, checksum)
      setState('ready')
    } catch {
      // Retry also failed — fall back
      modelData = modelManager.getBundledModel()
      if (modelData && modelData.byteLength > 0) {
        setState('ready')
      } else {
        setState('fallback')
      }
    }
  }
}

function handleClassify(
  id: string,
  text: string,
  _workbookContext: WorkbookContext
): void {
  if (state !== 'ready') {
    postResponse({
      type: 'error',
      id,
      error: `Cannot classify: engine is in "${state}" state`,
    })
    return
  }

  // Track as a pending operation for cancellation
  let cancelled = false
  pendingOperations.set(id, {
    cancel: () => {
      cancelled = true
    },
  })

  // Stub classification — returns a basic ClassificationResult
  // Real implementation will be added in task 3.1
  const result: ClassificationResult = {
    intentType: 'unknown',
    confidence: 0,
    entities: [],
    isMultiStep: false,
  }

  // Simulate async to allow cancellation
  Promise.resolve().then(() => {
    pendingOperations.delete(id)
    if (cancelled) return

    postResponse({ type: 'classifyResult', id, result })
  })
}

function handlePlanMacro(
  id: string,
  text: string,
  _workbookContext: WorkbookContext
): void {
  if (state !== 'ready') {
    postResponse({
      type: 'error',
      id,
      error: `Cannot plan macro: engine is in "${state}" state`,
    })
    return
  }

  // Track as a pending operation for cancellation
  let cancelled = false
  pendingOperations.set(id, {
    cancel: () => {
      cancelled = true
    },
  })

  // Stub macro planning — returns a basic MacroPlan
  // Real implementation will be added in task 8.1
  const result: MacroPlan = {
    steps: [],
    originalText: text,
    truncated: false,
  }

  // Simulate async to allow cancellation
  Promise.resolve().then(() => {
    pendingOperations.delete(id)
    if (cancelled) return

    postResponse({ type: 'planResult', id, result })
  })
}

function handleCancel(id: string): void {
  const operation = pendingOperations.get(id)
  if (operation) {
    operation.cancel()
    pendingOperations.delete(id)
  }
}

async function handleUpdateModel(
  modelUrl: string,
  checksum: string
): Promise<void> {
  if (state !== 'ready') {
    return
  }

  const previousModelData = modelData
  setState('updating')

  try {
    const manifest = { version: 'latest', url: modelUrl, checksum, size: 0 }
    const newModel = await modelManager.downloadAndValidate(manifest)
    modelData = newModel
    setState('ready')
  } catch {
    // Update failed — retain old model and go back to ready
    modelData = previousModelData
    setState('ready')
  }
}

// ─── Message Dispatch ───────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<NLPWorkerRequest>) => {
  const message = event.data

  switch (message.type) {
    case 'init':
      handleInit(message.modelUrl, message.checksum)
      break

    case 'classify':
      handleClassify(message.id, message.text, message.workbookContext)
      break

    case 'planMacro':
      handlePlanMacro(message.id, message.text, message.workbookContext)
      break

    case 'cancel':
      handleCancel(message.id)
      break

    case 'updateModel':
      handleUpdateModel(message.modelUrl, message.checksum)
      break
  }
}
