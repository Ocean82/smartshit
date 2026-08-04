import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ModelAssetRegistry, type ModelAssetsAccessor } from '@/onnx/modelAssetRegistry'
import type { ModelAsset } from '@/onnx/types'

/**
 * Property-based tests for the Model Asset Registry.
 * Validates: Requirements 6.1, 6.3, 6.5, 6.6
 */

// --- Helpers ---

function createMockAccessor(initial: Record<string, ModelAsset> = {}): ModelAssetsAccessor {
  let store = { ...initial }
  return {
    get: () => ({ ...store }),
    set: (assets) => { store = { ...assets } },
  }
}

function makeModelAsset(name: string): ModelAsset {
  return {
    name,
    hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    sizeBytes: 1024,
    opsetVersion: 13,
    inputShape: [-1, 4],
    inputDtype: 'float32',
    outputShape: [-1, 1],
    registeredAt: Date.now(),
    frequentlyUsed: false,
  }
}

const MODEL_NAME_REGEX = /^[a-zA-Z0-9_]{1,64}$/

// --- Arbitraries ---

const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'

/** Generates valid model names (1–64 alphanumeric/underscore characters) */
const validModelNameArb = fc
  .array(fc.constantFrom(...VALID_CHARS.split('')), { minLength: 1, maxLength: 64 })
  .map((chars) => chars.join(''))

/** Generates invalid model names (empty, too long, or containing invalid chars) */
const invalidModelNameArb = fc.oneof(
  // Empty string
  fc.constant(''),
  // Too long (65+ chars)
  fc.array(fc.constantFrom(...VALID_CHARS.split('')), { minLength: 65, maxLength: 128 })
    .map((chars) => chars.join('')),
  // Contains invalid characters (at least one non-alphanumeric/non-underscore)
  fc.tuple(
    fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 0, maxLength: 10 }),
    fc.constantFrom(' ', '-', '.', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '/', '\\', '~', '`'),
    fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 0, maxLength: 10 }),
  ).map(([prefix, invalid, suffix]) => prefix.join('') + invalid + suffix.join('')),
)

/** Generates an array of unique cell references like A1, B3, etc. */
const cellRefsArb = fc.uniqueArray(
  fc.tuple(
    fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'),
    fc.integer({ min: 1, max: 100 }),
  ).map(([col, row]) => `${col}${row}`),
  { minLength: 0, maxLength: 20 },
)

// --- Property 6: Model Name Validation ---

describe('Property 6: Model Name Validation', () => {
  /**
   * Validates: Requirements 6.1
   * For any random string, validateName returns true iff the string matches ^[a-zA-Z0-9_]{1,64}$
   */
  it('validateName returns true iff string matches ^[a-zA-Z0-9_]{1,64}$', () => {
    const registry = new ModelAssetRegistry(createMockAccessor())

    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 128 }), (name) => {
        const result = registry.validateName(name)
        const expected = MODEL_NAME_REGEX.test(name)
        expect(result).toBe(expected)
      }),
      { numRuns: 1000 },
    )
  })

  /**
   * Validates: Requirements 6.1
   * Valid names are always accepted by validateName
   */
  it('valid model names are always accepted', () => {
    const registry = new ModelAssetRegistry(createMockAccessor())

    fc.assert(
      fc.property(validModelNameArb, (name) => {
        expect(registry.validateName(name)).toBe(true)
      }),
      { numRuns: 500 },
    )
  })

  /**
   * Validates: Requirements 6.1
   * Invalid names are always rejected by validateName
   */
  it('invalid model names are always rejected', () => {
    const registry = new ModelAssetRegistry(createMockAccessor())

    fc.assert(
      fc.property(invalidModelNameArb, (name) => {
        expect(registry.validateName(name)).toBe(false)
      }),
      { numRuns: 500 },
    )
  })

  /**
   * Validates: Requirements 6.3
   * Registering a model with a name that already exists is rejected
   */
  it('register rejects duplicate names', () => {
    fc.assert(
      fc.property(validModelNameArb, (name) => {
        const accessor = createMockAccessor()
        const registry = new ModelAssetRegistry(accessor)
        const asset = makeModelAsset(name)

        // First registration succeeds
        const first = registry.register(name, asset)
        expect(first.success).toBe(true)

        // Second registration with the same name fails
        const second = registry.register(name, asset)
        expect(second.success).toBe(false)
        expect(second.error).toContain('already exists')
      }),
      { numRuns: 300 },
    )
  })

  /**
   * Validates: Requirements 6.1
   * Registration with invalid names is always rejected
   */
  it('register rejects invalid names', () => {
    fc.assert(
      fc.property(invalidModelNameArb, (name) => {
        const accessor = createMockAccessor()
        const registry = new ModelAssetRegistry(accessor)
        const asset = makeModelAsset(name)

        const result = registry.register(name, asset)
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
      }),
      { numRuns: 300 },
    )
  })
})

// --- Property 7: Model Deletion Reference Cascade ---

describe('Property 7: Model Deletion Reference Cascade', () => {
  /**
   * Validates: Requirements 6.6
   * When a model is deleted, the affectedCells returned match exactly the cells
   * referencing that model (as determined by the findReferencingCells callback).
   */
  it('deletion returns exactly the cells referencing the deleted model', () => {
    fc.assert(
      fc.property(
        validModelNameArb,
        cellRefsArb,
        (modelName, referencingCells) => {
          const asset = makeModelAsset(modelName)
          const accessor = createMockAccessor({ [modelName]: asset })
          const registry = new ModelAssetRegistry(accessor)

          const findReferencingCells = (name: string): string[] => {
            if (name === modelName) return referencingCells
            return []
          }

          const result = registry.delete(modelName, findReferencingCells)

          expect(result.success).toBe(true)
          // The affected cells must be exactly what findReferencingCells returned
          expect(result.affectedCells).toEqual(referencingCells)
        },
      ),
      { numRuns: 500 },
    )
  })

  /**
   * Validates: Requirements 6.6
   * After deletion, the model is no longer retrievable from the registry.
   */
  it('deleted model is no longer retrievable', () => {
    fc.assert(
      fc.property(validModelNameArb, (modelName) => {
        const asset = makeModelAsset(modelName)
        const accessor = createMockAccessor({ [modelName]: asset })
        const registry = new ModelAssetRegistry(accessor)

        // Model exists before deletion
        expect(registry.get(modelName)).not.toBeNull()

        registry.delete(modelName, () => [])

        // Model no longer exists after deletion
        expect(registry.get(modelName)).toBeNull()
      }),
      { numRuns: 300 },
    )
  })

  /**
   * Validates: Requirements 6.6
   * Deleting a non-existent model returns success: false with no affected cells.
   */
  it('deleting a non-existent model returns failure with no affected cells', () => {
    fc.assert(
      fc.property(validModelNameArb, (modelName) => {
        const accessor = createMockAccessor()
        const registry = new ModelAssetRegistry(accessor)

        const result = registry.delete(modelName, () => ['A1', 'B2'])

        expect(result.success).toBe(false)
        expect(result.affectedCells).toEqual([])
      }),
      { numRuns: 200 },
    )
  })

  /**
   * Validates: Requirements 6.6
   * Deletion only affects the targeted model; other registered models remain intact.
   */
  it('deletion of one model does not affect other registered models', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(validModelNameArb, { minLength: 2, maxLength: 5 }),
        (modelNames) => {
          const assets: Record<string, ModelAsset> = {}
          for (const name of modelNames) {
            assets[name] = makeModelAsset(name)
          }

          const accessor = createMockAccessor(assets)
          const registry = new ModelAssetRegistry(accessor)

          // Delete the first model
          const targetName = modelNames[0]
          registry.delete(targetName, () => [])

          // All other models remain
          for (const name of modelNames.slice(1)) {
            expect(registry.get(name)).not.toBeNull()
            expect(registry.get(name)!.name).toBe(name)
          }

          // The deleted model is gone
          expect(registry.get(targetName)).toBeNull()
        },
      ),
      { numRuns: 300 },
    )
  })
})

// --- Property 21: Non-Existent Model Returns Error ---

describe('Property 21: Non-Existent Model Returns Error', () => {
  /**
   * Validates: Requirements 6.5
   * get() returns null for any model name not in the registry.
   */
  it('get() returns null for unregistered model names', () => {
    fc.assert(
      fc.property(
        validModelNameArb,
        fc.uniqueArray(validModelNameArb, { minLength: 0, maxLength: 5 }),
        (queryName, registeredNames) => {
          // Only test when queryName is NOT among registeredNames
          fc.pre(!registeredNames.includes(queryName))

          const assets: Record<string, ModelAsset> = {}
          for (const name of registeredNames) {
            assets[name] = makeModelAsset(name)
          }

          const accessor = createMockAccessor(assets)
          const registry = new ModelAssetRegistry(accessor)

          // Querying for a name not in the registry returns null
          expect(registry.get(queryName)).toBeNull()
        },
      ),
      { numRuns: 500 },
    )
  })

  /**
   * Validates: Requirements 6.5
   * get() returns null for any arbitrary string that is not registered,
   * including invalid names.
   */
  it('get() returns null for any non-registered name (including invalid names)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 128 }),
        (queryName) => {
          // Empty registry — any name should return null
          const accessor = createMockAccessor()
          const registry = new ModelAssetRegistry(accessor)

          expect(registry.get(queryName)).toBeNull()
        },
      ),
      { numRuns: 500 },
    )
  })

  /**
   * Validates: Requirements 6.5
   * get() returns the correct asset for registered names (inverse property:
   * ensures get is correct for both registered and unregistered names).
   */
  it('get() returns the asset for registered names, null for others', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(validModelNameArb, { minLength: 1, maxLength: 5 }),
        validModelNameArb,
        (registeredNames, queryName) => {
          const assets: Record<string, ModelAsset> = {}
          for (const name of registeredNames) {
            assets[name] = makeModelAsset(name)
          }

          const accessor = createMockAccessor(assets)
          const registry = new ModelAssetRegistry(accessor)

          if (registeredNames.includes(queryName)) {
            // Registered name → returns the asset
            const result = registry.get(queryName)
            expect(result).not.toBeNull()
            expect(result!.name).toBe(queryName)
          } else {
            // Not registered → returns null (#NAME? in formula context)
            expect(registry.get(queryName)).toBeNull()
          }
        },
      ),
      { numRuns: 500 },
    )
  })
})
