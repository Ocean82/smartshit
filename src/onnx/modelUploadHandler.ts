/**
 * Model Upload Handler
 *
 * Orchestrates the full model upload flow: security validation, SHA-256 hash
 * computation, and registration in the Model Asset Registry. Handles timeouts,
 * cleanup on failure, size-based rejection with Path B suggestions, and provides
 * status callbacks for UI feedback (loading, error, success).
 *
 * Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 1.5, 1.6, 1.7, 1.8
 */

import type { ModelAsset } from './types';
import {
  validateOnnxSecurity,
  MAX_UPLOAD_SIZE_BYTES,
  VALIDATION_TIMEOUT_MS,
  type SecurityValidationInput,
  type SecurityRejectionReason,
} from './securityValidator';
import { ModelAssetRegistry } from './modelAssetRegistry';

// --- Constants ---

/** Default validation timeout (60 seconds) */
export const UPLOAD_TIMEOUT_MS = VALIDATION_TIMEOUT_MS;

// --- Types ---

export type UploadStatus =
  | 'loading'
  | 'validating'
  | 'computing_hash'
  | 'registering'
  | 'success'
  | 'error';

export type UploadErrorReason =
  | SecurityRejectionReason
  | 'invalid_name'
  | 'duplicate_name'
  | 'network_error'
  | 'disk_error'
  | 'memory_error'
  | 'aborted';

export interface UploadStatusEvent {
  status: UploadStatus;
  message?: string;
  progress?: number; // 0-100
}

export interface UploadSuccessResult {
  success: true;
  asset: ModelAsset;
}

export interface UploadErrorResult {
  success: false;
  reason: UploadErrorReason;
  message: string;
  /** Whether switching to Path B is suggested */
  suggestPathB?: boolean;
  /** Whether a retry is possible */
  canRetry?: boolean;
}

export type UploadResult = UploadSuccessResult | UploadErrorResult;

export interface UploadOptions {
  /** User-provided model name */
  modelName: string;
  /** The raw file content */
  fileData: ArrayBuffer;
  /** ONNX opset version (extracted from model metadata by caller) */
  opsetVersion: number;
  /** Expected input tensor shape */
  inputShape: number[];
  /** Expected input element type */
  inputDtype: 'float32' | 'float64' | 'int32' | 'int64';
  /** Expected output tensor shape */
  outputShape: number[];
  /** Whether this model is intended for in-browser use */
  forBrowserUse: boolean;
  /** Current user's total storage usage in bytes */
  currentUsageBytes: number;
  /** Status callback for UI updates */
  onStatus?: (event: UploadStatusEvent) => void;
  /** Override timeout for testing (default: 60000ms) */
  timeoutMs?: number;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
}

export interface ModelUploadHandlerDeps {
  registry: ModelAssetRegistry;
  /** Compute SHA-256 hash of an ArrayBuffer, returning hex string */
  computeHash: (data: ArrayBuffer) => Promise<string>;
  /** Cleanup temporary upload data (e.g. remove temp files) */
  cleanupTempData?: () => void | Promise<void>;
}

// --- Implementation ---

/**
 * Handles the full model upload flow:
 * 1. Validate model name
 * 2. Run security validation (protobuf magic, size, opset, quota)
 * 3. Compute SHA-256 hash
 * 4. Register in ModelAssetRegistry
 * 5. Clean up on any failure
 *
 * Implements a 60-second timeout for the entire upload + validation flow.
 */
export async function handleModelUpload(
  options: UploadOptions,
  deps: ModelUploadHandlerDeps,
): Promise<UploadResult> {
  const {
    modelName,
    fileData,
    opsetVersion,
    inputShape,
    inputDtype,
    outputShape,
    forBrowserUse,
    currentUsageBytes,
    onStatus,
    timeoutMs = UPLOAD_TIMEOUT_MS,
    signal,
  } = options;

  const { registry, computeHash, cleanupTempData } = deps;

  // Check if already aborted
  if (signal?.aborted) {
    return {
      success: false,
      reason: 'aborted',
      message: 'Upload was cancelled.',
      canRetry: true,
    };
  }

  // --- Timeout wrapper ---
  const uploadPromise = executeUploadFlow(
    modelName,
    fileData,
    opsetVersion,
    inputShape,
    inputDtype,
    outputShape,
    forBrowserUse,
    currentUsageBytes,
    registry,
    computeHash,
    cleanupTempData,
    onStatus,
    signal,
  );

  const timeoutPromise = new Promise<UploadResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        success: false,
        reason: 'timeout',
        message: 'Model upload validation timed out after 60 seconds. Upload rejected.',
        canRetry: true,
      });
    }, timeoutMs);

    // Clear timeout if signal aborts
    signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

  const result = await Promise.race([uploadPromise, timeoutPromise]);

  // If we timed out or failed, ensure cleanup runs
  if (!result.success && cleanupTempData) {
    try {
      await cleanupTempData();
    } catch {
      // Cleanup failure is non-critical; the main error is already captured
    }
  }

  return result;
}

/**
 * Core upload flow logic (without timeout wrapper).
 */
async function executeUploadFlow(
  modelName: string,
  fileData: ArrayBuffer,
  opsetVersion: number,
  inputShape: number[],
  inputDtype: 'float32' | 'float64' | 'int32' | 'int64',
  outputShape: number[],
  forBrowserUse: boolean,
  currentUsageBytes: number,
  registry: ModelAssetRegistry,
  computeHash: (data: ArrayBuffer) => Promise<string>,
  cleanupTempData: (() => void | Promise<void>) | undefined,
  onStatus: ((event: UploadStatusEvent) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<UploadResult> {
  // Step 1: Validate model name
  onStatus?.({ status: 'loading', message: 'Initializing model upload...' });

  if (!registry.validateName(modelName)) {
    return {
      success: false,
      reason: 'invalid_name',
      message: `Invalid model name "${modelName}". Must be 1–64 alphanumeric or underscore characters.`,
    };
  }

  // Check for abort
  if (signal?.aborted) {
    return { success: false, reason: 'aborted', message: 'Upload was cancelled.', canRetry: true };
  }

  // Step 2: Run security validation
  onStatus?.({ status: 'validating', message: 'Validating model file security...', progress: 25 });

  const fileBytes = new Uint8Array(fileData);
  const fileSizeBytes = fileData.byteLength;

  const securityInput: SecurityValidationInput = {
    fileBytes,
    fileSizeBytes,
    opsetVersion,
    forBrowserUse,
    currentUsageBytes,
  };

  const securityResult = await validateOnnxSecurity(securityInput, {
    onCleanup: cleanupTempData,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

  if (!securityResult.valid) {
    const suggestPathB =
      securityResult.rejectionReason === 'exceeds_browser_limit' ||
      (securityResult.rejectionReason === 'oversized' && fileSizeBytes <= MAX_UPLOAD_SIZE_BYTES);

    return {
      success: false,
      reason: securityResult.rejectionReason!,
      message: securityResult.message ?? 'Security validation failed.',
      suggestPathB,
      canRetry: securityResult.rejectionReason === 'timeout',
    };
  }

  // Check for abort
  if (signal?.aborted) {
    return { success: false, reason: 'aborted', message: 'Upload was cancelled.', canRetry: true };
  }

  // Step 3: Compute SHA-256 hash
  onStatus?.({ status: 'computing_hash', message: 'Computing file hash...', progress: 60 });

  let hash: string;
  try {
    hash = await computeHash(fileData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Determine the error type
    const reason = classifyComputeError(error);
    return {
      success: false,
      reason,
      message: `Failed to compute model hash: ${errorMessage}`,
      canRetry: reason !== 'memory_error',
      suggestPathB: reason === 'memory_error',
    };
  }

  // Check for abort
  if (signal?.aborted) {
    return { success: false, reason: 'aborted', message: 'Upload was cancelled.', canRetry: true };
  }

  // Step 4: Register in ModelAssetRegistry
  onStatus?.({ status: 'registering', message: 'Registering model asset...', progress: 85 });

  const asset: ModelAsset = {
    name: modelName,
    hash,
    sizeBytes: fileSizeBytes,
    opsetVersion,
    inputShape,
    inputDtype,
    outputShape,
    registeredAt: Date.now(),
    frequentlyUsed: false,
  };

  const registerResult = registry.register(modelName, asset);

  if (!registerResult.success) {
    return {
      success: false,
      reason: 'duplicate_name',
      message: registerResult.error ?? `A model with name "${modelName}" already exists.`,
    };
  }

  // Step 5: Success
  onStatus?.({ status: 'success', message: 'Model registered successfully.', progress: 100 });

  return { success: true, asset };
}

/**
 * Classifies errors during hash computation into error reasons.
 */
function classifyComputeError(error: unknown): UploadErrorReason {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('memory') || msg.includes('oom') || msg.includes('allocation')) {
      return 'memory_error';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
      return 'network_error';
    }
    if (msg.includes('disk') || msg.includes('storage') || msg.includes('write') || msg.includes('read')) {
      return 'disk_error';
    }
  }
  return 'network_error';
}
