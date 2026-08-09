/**
 * Property-Based Tests for ONNX Security Validator
 *
 * Property 8: Security Validation
 * For any random byte sequence: accepted iff magic bytes valid AND size < 500MB
 * AND opset 7–20. Files > 100MB rejected for in-browser use.
 *
 * Property 9: Storage Quota Enforcement
 * For any (currentUsage, newFileSize) pair: rejected iff sum > 1GB.
 *
 * Validates: Requirements 7.1, 7.4, 1.5
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validateMagicBytes,
  validateFileSize,
  validateOpsetVersion,
  validateStorageQuota,
  runValidationPipeline,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_BROWSER_SIZE_BYTES,
  USER_STORAGE_QUOTA_BYTES,
  MIN_OPSET_VERSION,
  MAX_OPSET_VERSION,
  ONNX_PROTOBUF_MAGIC_BYTE,
  type SecurityValidationInput,
} from './securityValidator'

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Generates valid ONNX magic bytes (0x08 followed by a valid ir_version 1-127) */
const validMagicBytesArb = fc.integer({ min: 1, max: 127 }).map(irVersion => {
  const bytes = new Uint8Array(64)
  bytes[0] = ONNX_PROTOBUF_MAGIC_BYTE
  bytes[1] = irVersion
  // Fill rest with plausible protobuf content
  for (let i = 2; i < 64; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
})

/** Generates invalid magic bytes (first byte != 0x08, or second byte invalid) */
const invalidMagicBytesArb = fc.oneof(
  // Wrong first byte
  fc.integer({ min: 0, max: 255 }).filter(b => b !== ONNX_PROTOBUF_MAGIC_BYTE)
    .map(firstByte => {
      const bytes = new Uint8Array(64)
      bytes[0] = firstByte
      bytes[1] = 5
      return bytes
    }),
  // Correct first byte but ir_version = 0
  fc.constant(new Uint8Array([ONNX_PROTOBUF_MAGIC_BYTE, 0, ...Array(62).fill(0)])),
  // Too short (< 2 bytes)
  fc.integer({ min: 0, max: 1 }).map(len => new Uint8Array(len)),
)

// ─── Property 8: Security Validation ────────────────────────────────────────

describe('Property 8: Security Validation', () => {
  it('accepts files with valid magic bytes', () => {
    fc.assert(
      fc.property(validMagicBytesArb, (bytes) => {
        const result = validateMagicBytes(bytes)
        expect(result.valid).toBe(true)
      }),
      { numRuns: 50 },
    )
  })

  it('rejects files with invalid magic bytes', () => {
    fc.assert(
      fc.property(invalidMagicBytesArb, (bytes) => {
        const result = validateMagicBytes(bytes)
        expect(result.valid).toBe(false)
        expect(result.rejectionReason).toBe('invalid_format')
      }),
      { numRuns: 50 },
    )
  })

  it('rejects files > 500MB for upload', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_UPLOAD_SIZE_BYTES + 1, max: MAX_UPLOAD_SIZE_BYTES * 2 }),
        (size) => {
          const result = validateFileSize(size, false)
          expect(result.valid).toBe(false)
          expect(result.rejectionReason).toBe('oversized')
        },
      ),
      { numRuns: 30 },
    )
  })

  it('accepts files ≤ 500MB for server-side use', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_UPLOAD_SIZE_BYTES }),
        (size) => {
          const result = validateFileSize(size, false)
          expect(result.valid).toBe(true)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('rejects files > 100MB for in-browser use', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_BROWSER_SIZE_BYTES + 1, max: MAX_UPLOAD_SIZE_BYTES }),
        (size) => {
          const result = validateFileSize(size, true)
          expect(result.valid).toBe(false)
          expect(result.rejectionReason).toBe('exceeds_browser_limit')
        },
      ),
      { numRuns: 30 },
    )
  })

  it('accepts files ≤ 100MB for in-browser use', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_BROWSER_SIZE_BYTES }),
        (size) => {
          const result = validateFileSize(size, true)
          expect(result.valid).toBe(true)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('accepts opset versions within 7–20', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_OPSET_VERSION, max: MAX_OPSET_VERSION }),
        (opset) => {
          const result = validateOpsetVersion(opset)
          expect(result.valid).toBe(true)
        },
      ),
      { numRuns: 14 }, // All 14 valid values
    )
  })

  it('rejects opset versions outside 7–20', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -100, max: MIN_OPSET_VERSION - 1 }),
          fc.integer({ min: MAX_OPSET_VERSION + 1, max: 100 }),
        ),
        (opset) => {
          const result = validateOpsetVersion(opset)
          expect(result.valid).toBe(false)
          expect(result.rejectionReason).toBe('unsupported_opset')
        },
      ),
      { numRuns: 30 },
    )
  })

  it('full pipeline accepts only when all checks pass', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 127 }), // ir_version for valid magic
        fc.integer({ min: 1, max: MAX_BROWSER_SIZE_BYTES }), // valid size for browser
        fc.integer({ min: MIN_OPSET_VERSION, max: MAX_OPSET_VERSION }), // valid opset
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES / 2 }), // current usage (room for file)
        (irVersion, fileSize, opset, currentUsage) => {
          fc.pre(currentUsage + fileSize <= USER_STORAGE_QUOTA_BYTES)

          const bytes = new Uint8Array(64)
          bytes[0] = ONNX_PROTOBUF_MAGIC_BYTE
          bytes[1] = irVersion

          const input: SecurityValidationInput = {
            fileBytes: bytes,
            fileSizeBytes: fileSize,
            opsetVersion: opset,
            forBrowserUse: true,
            currentUsageBytes: currentUsage,
          }

          const result = runValidationPipeline(input)
          expect(result.valid).toBe(true)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 9: Storage Quota Enforcement ──────────────────────────────────

describe('Property 9: Storage Quota Enforcement', () => {
  it('rejects when currentUsage + newFileSize > 1GB', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES }),
        fc.integer({ min: 1, max: USER_STORAGE_QUOTA_BYTES }),
        (currentUsage, newFileSize) => {
          fc.pre(currentUsage + newFileSize > USER_STORAGE_QUOTA_BYTES)

          const result = validateStorageQuota(currentUsage, newFileSize)
          expect(result.valid).toBe(false)
          expect(result.rejectionReason).toBe('quota_exceeded')
          expect(result.quotaDetails).toBeDefined()
          expect(result.quotaDetails!.currentUsageBytes).toBe(currentUsage)
          expect(result.quotaDetails!.newFileSizeBytes).toBe(newFileSize)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('accepts when currentUsage + newFileSize ≤ 1GB', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES }),
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES }),
        (currentUsage, newFileSize) => {
          fc.pre(currentUsage + newFileSize <= USER_STORAGE_QUOTA_BYTES)

          const result = validateStorageQuota(currentUsage, newFileSize)
          expect(result.valid).toBe(true)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('quota check is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES * 2 }),
        fc.integer({ min: 0, max: USER_STORAGE_QUOTA_BYTES * 2 }),
        (currentUsage, newFileSize) => {
          const r1 = validateStorageQuota(currentUsage, newFileSize)
          const r2 = validateStorageQuota(currentUsage, newFileSize)
          expect(r1.valid).toBe(r2.valid)
          expect(r1.rejectionReason).toBe(r2.rejectionReason)
        },
      ),
      { numRuns: 50 },
    )
  })
})
