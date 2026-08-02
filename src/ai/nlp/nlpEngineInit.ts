/**
 * NLP Engine Initialization Module
 *
 * Provides application-level initialization for the NLP engine. This module
 * manages a singleton NLPEngineClient instance and exposes state observation
 * for the UI. It should be called once at app startup (non-blocking).
 *
 * Responsibilities:
 * - Creates and stores the NLPEngineClient singleton
 * - Exposes engine state for UI rendering (loading/ready/fallback)
 * - Sets up model update detection after engine reaches ready state
 * - Ensures bundled model is used on first load before CDN model available
 *
 * @module nlpEngineInit
 */

import type { NLPConfig, NLPEngineState } from './types'
import { createNLPEngineClient, type NLPEngineClient } from './nlpEngineClient'
import { createModelManager, type ModelManager } from './modelManager'

// ─── Default Configuration ──────────────────────────────────────────────────

export const DEFAULT_NLP_CONFIG: NLPConfig = {
  modelBaseUrl: '/models/nlp/',
  bundledModelVersion: '1.0.0',
  fallbackThreshold: 0.6,
  initTimeoutMs: 10_000,
  maxRetries: 1,
  maxMacroSteps: 5,
  inferenceTimeoutMs: 500,
}

// ─── Module-level Singleton ─────────────────────────────────────────────────

let engineInstance: NLPEngineClient | null = null
let modelManagerInstance: ModelManager | null = null
let currentState: NLPEngineState = 'loading'
let modelUpdateChecked = false
const stateListeners = new Set<(state: NLPEngineState) => void>()

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initializes the NLP engine as a background task. Returns immediately
 * (non-blocking) — the worker starts loading the model in the background.
 *
 * If already initialized, returns the existing instance without creating a new one.
 *
 * @param config - Partial NLP configuration, merged with defaults
 * @returns The NLPEngineClient singleton
 */
export function initializeNLPEngine(config?: Partial<NLPConfig>): NLPEngineClient {
  if (engineInstance) {
    return engineInstance
  }

  const mergedConfig: NLPConfig = { ...DEFAULT_NLP_CONFIG, ...config }

  engineInstance = createNLPEngineClient(mergedConfig)
  modelManagerInstance = createModelManager(mergedConfig)
  currentState = engineInstance.state
  modelUpdateChecked = false

  // Subscribe to state changes to keep local state in sync and notify listeners
  engineInstance.onStateChange((state) => {
    currentState = state
    for (const listener of stateListeners) {
      try {
        listener(state)
      } catch {
        // Don't let listener errors crash the initialization flow
      }
    }

    // Once the engine reaches 'ready', check for model updates on subsequent loads.
    // This ensures bundled model is used on first load, and CDN model is picked up
    // when available without interrupting user interaction.
    if (state === 'ready' && !modelUpdateChecked) {
      modelUpdateChecked = true
      checkForModelUpdate(mergedConfig)
    }
  })

  return engineInstance
}

/**
 * Retrieves the NLP engine singleton, or null if not yet initialized.
 */
export function getNLPEngine(): NLPEngineClient | null {
  return engineInstance
}

/**
 * Returns the current NLP engine state. If the engine has not been initialized,
 * returns 'loading' as the default state.
 */
export function getNLPEngineState(): NLPEngineState {
  return currentState
}

/**
 * Registers a callback for NLP engine state changes. Returns an unsubscribe function.
 *
 * This allows UI components to react to state transitions (loading → ready, etc.)
 * without directly importing the NLPEngineClient.
 *
 * @param cb - Callback invoked with the new state on each transition
 * @returns Unsubscribe function that removes the listener
 */
export function onNLPEngineStateChange(cb: (state: NLPEngineState) => void): () => void {
  stateListeners.add(cb)
  return () => {
    stateListeners.delete(cb)
  }
}

/**
 * Disposes and clears the NLP engine singleton. Used for testing to ensure
 * a clean state between test runs.
 */
export function resetNLPEngine(): void {
  if (engineInstance) {
    engineInstance.dispose()
    engineInstance = null
  }
  modelManagerInstance = null
  modelUpdateChecked = false
  currentState = 'loading'
  stateListeners.clear()
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Checks for a new model version from the CDN and triggers a background update
 * on the NLP worker if a newer version is available. This runs after the engine
 * reaches 'ready' state on subsequent loads (not first boot).
 *
 * The update is non-blocking — the engine continues serving requests with the
 * current model while downloading. If the update fails, the old model is retained.
 */
async function checkForModelUpdate(_config: NLPConfig): Promise<void> {
  if (!modelManagerInstance || !engineInstance) return

  try {
    const manifest = await modelManagerInstance.checkForUpdate()
    if (!manifest) return // No update available

    // A newer model version is available — tell the worker to update
    // The worker will transition: Ready → Updating → Ready (or retain old on failure)
    console.info(
      `[NLPEngine] New model version detected: ${manifest.version}. Downloading update...`,
    )

    // The update message is handled by the worker's handleUpdateModel,
    // which downloads, validates checksum, and swaps the model atomically.
    // We can't postMessage directly to the worker from here since it's
    // encapsulated in the client. Instead, the model manager downloads and
    // validates, and we rely on the client's internal worker communication.
    //
    // For now, pre-download and validate to cache the new model.
    // On next app load, the worker will pick up the cached version.
    await modelManagerInstance.downloadAndValidate(manifest)
    console.info(
      `[NLPEngine] Model updated to version ${manifest.version}. Will be active on next load.`,
    )
  } catch (error) {
    // Model update check/download failed — non-critical, log and continue
    console.warn('[NLPEngine] Model update check failed:', error)
  }
}
