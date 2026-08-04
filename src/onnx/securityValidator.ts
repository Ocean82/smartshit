/**
 * ONNX Security Validator
 *
 * Validates uploaded ONNX model files for safety before allowing them into the system.
 * Checks protobuf header, file size, opset version, storage quota, and enforces a
 * validation timeout.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 1.5
 */

// --- Constants ---

/** Maximum file size for any upload (500MB) */
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

/** Maximum file size for in-browser use (100MB) */
export const MAX_BROWSER_SIZE_BYTES = 100 * 1024 * 1024;

/** Per-user storage quota (1GB = 1,073,741,824 bytes) */
export const USER_STORAGE_QUOTA_BYTES = 1_073_741_824;

/** Minimum supported opset version */
export const MIN_OPSET_VERSION = 7;

/** Maximum supported opset version */
export const MAX_OPSET_VERSION = 20;

/** Validation timeout in milliseconds (60 seconds) */
export const VALIDATION_TIMEOUT_MS = 60_000;

/**
 * ONNX files are serialized protobuf. The protobuf wire format uses a field tag
 * as the first byte. For ONNX ModelProto, field 1 (ir_version) with wire type 0
 * (varint) gives tag byte 0x08. We check for this as the magic byte signature.
 *
 * Additionally, we verify that subsequent bytes are plausible protobuf content
 * (the varint value for ir_version should be a small positive integer in practice).
 */
export const ONNX_PROTOBUF_MAGIC_BYTE = 0x08;

// --- Types ---

export type SecurityRejectionReason =
  | 'invalid_format'
  | 'oversized'
  | 'exceeds_browser_limit'
  | 'unsupported_opset'
  | 'quota_exceeded'
  | 'timeout';

export interface SecurityValidationResult {
  valid: boolean;
  rejectionReason?: SecurityRejectionReason;
  message?: string;
  /** Details for quota rejection */
  quotaDetails?: {
    currentUsageBytes: number;
    newFileSizeBytes: number;
    quotaLimitBytes: number;
  };
}

export interface SecurityValidationInput {
  /** The raw file bytes (at minimum the first few bytes for header check) */
  fileBytes: Uint8Array;
  /** Total file size in bytes */
  fileSizeBytes: number;
  /** The opset version extracted from the model metadata */
  opsetVersion: number;
  /** Whether this file is intended for in-browser use */
  forBrowserUse: boolean;
  /** Current user's total storage usage in bytes */
  currentUsageBytes: number;
}

// --- Validator Functions ---

/**
 * Validates that the file begins with valid ONNX protobuf magic bytes.
 *
 * ONNX models are Protocol Buffer serializations of the ModelProto message.
 * The first field is `ir_version` (field number 1, wire type 0 = varint),
 * which encodes as tag byte 0x08 followed by a varint value.
 */
export function validateMagicBytes(fileBytes: Uint8Array): SecurityValidationResult {
  if (fileBytes.length < 2) {
    return {
      valid: false,
      rejectionReason: 'invalid_format',
      message: 'File is too small to be a valid ONNX model',
    };
  }

  // First byte must be the protobuf tag for field 1, wire type 0 (varint)
  if (fileBytes[0] !== ONNX_PROTOBUF_MAGIC_BYTE) {
    return {
      valid: false,
      rejectionReason: 'invalid_format',
      message: 'Invalid ONNX file: protobuf header magic bytes not found',
    };
  }

  // The second byte is the start of the varint for ir_version.
  // Valid ONNX ir_versions are small positive integers (typically 1–9).
  // A varint byte with the high bit set indicates continuation — for ir_version,
  // a single byte (value 1–127) is expected.
  const irVersionByte = fileBytes[1];
  if (irVersionByte === 0 || irVersionByte > 127) {
    return {
      valid: false,
      rejectionReason: 'invalid_format',
      message: 'Invalid ONNX file: unexpected ir_version value in protobuf header',
    };
  }

  return { valid: true };
}

/**
 * Validates file size against upload and browser limits.
 */
export function validateFileSize(
  fileSizeBytes: number,
  forBrowserUse: boolean,
): SecurityValidationResult {
  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      rejectionReason: 'oversized',
      message: `File size (${formatBytes(fileSizeBytes)}) exceeds the maximum upload limit of ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}`,
    };
  }

  if (forBrowserUse && fileSizeBytes > MAX_BROWSER_SIZE_BYTES) {
    return {
      valid: false,
      rejectionReason: 'exceeds_browser_limit',
      message: `File size (${formatBytes(fileSizeBytes)}) exceeds the in-browser limit of ${formatBytes(MAX_BROWSER_SIZE_BYTES)}. Consider using server-side execution (Path B).`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the opset version is within the supported range (7–20).
 */
export function validateOpsetVersion(opsetVersion: number): SecurityValidationResult {
  if (
    !Number.isInteger(opsetVersion) ||
    opsetVersion < MIN_OPSET_VERSION ||
    opsetVersion > MAX_OPSET_VERSION
  ) {
    return {
      valid: false,
      rejectionReason: 'unsupported_opset',
      message: `Opset version ${opsetVersion} is not supported. Supported range: ${MIN_OPSET_VERSION}–${MAX_OPSET_VERSION}.`,
    };
  }

  return { valid: true };
}

/**
 * Validates that adding the new file would not exceed the per-user storage quota.
 * Quota: currentUsage + newFileSize must be ≤ 1GB (1,073,741,824 bytes).
 */
export function validateStorageQuota(
  currentUsageBytes: number,
  newFileSizeBytes: number,
): SecurityValidationResult {
  const totalAfterUpload = currentUsageBytes + newFileSizeBytes;

  if (totalAfterUpload > USER_STORAGE_QUOTA_BYTES) {
    return {
      valid: false,
      rejectionReason: 'quota_exceeded',
      message: `Upload would exceed per-user storage quota. Current usage: ${formatBytes(currentUsageBytes)}, file size: ${formatBytes(newFileSizeBytes)}, quota limit: ${formatBytes(USER_STORAGE_QUOTA_BYTES)}.`,
      quotaDetails: {
        currentUsageBytes,
        newFileSizeBytes,
        quotaLimitBytes: USER_STORAGE_QUOTA_BYTES,
      },
    };
  }

  return { valid: true };
}

/**
 * Runs the full security validation pipeline with a 60-second timeout.
 * If validation does not complete within the timeout, it aborts and returns
 * a timeout rejection. The onCleanup callback is invoked to remove any
 * temporary data written during the upload attempt.
 */
export async function validateOnnxSecurity(
  input: SecurityValidationInput,
  options?: {
    /** Callback to clean up temporary data if validation fails or times out */
    onCleanup?: () => void | Promise<void>;
    /** Override timeout for testing (default: 60000ms) */
    timeoutMs?: number;
  },
): Promise<SecurityValidationResult> {
  const timeoutMs = options?.timeoutMs ?? VALIDATION_TIMEOUT_MS;

  const validationPromise = runValidationPipeline(input);

  const timeoutPromise = new Promise<SecurityValidationResult>((resolve) => {
    setTimeout(() => {
      resolve({
        valid: false,
        rejectionReason: 'timeout',
        message: 'Security validation timed out after 60 seconds. Upload rejected.',
      });
    }, timeoutMs);
  });

  const result = await Promise.race([validationPromise, timeoutPromise]);

  // If validation failed or timed out, run cleanup
  if (!result.valid && options?.onCleanup) {
    await options.onCleanup();
  }

  return result;
}

/**
 * Runs the synchronous validation pipeline (all checks in sequence).
 * Exported for testing purposes.
 */
export function runValidationPipeline(input: SecurityValidationInput): SecurityValidationResult {
  // 1. Check protobuf magic bytes
  const magicResult = validateMagicBytes(input.fileBytes);
  if (!magicResult.valid) return magicResult;

  // 2. Check file size
  const sizeResult = validateFileSize(input.fileSizeBytes, input.forBrowserUse);
  if (!sizeResult.valid) return sizeResult;

  // 3. Check opset version
  const opsetResult = validateOpsetVersion(input.opsetVersion);
  if (!opsetResult.valid) return opsetResult;

  // 4. Check storage quota
  const quotaResult = validateStorageQuota(input.currentUsageBytes, input.fileSizeBytes);
  if (!quotaResult.valid) return quotaResult;

  return { valid: true };
}

// --- Utilities ---

/**
 * Formats byte values into human-readable strings.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
