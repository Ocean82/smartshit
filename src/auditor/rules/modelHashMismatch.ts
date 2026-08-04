/**
 * Rule: Model Hash Mismatch Detection
 *
 * Detects when a Model_Asset's current file hash differs from the hash
 * registered at upload time. This indicates the model file was modified
 * externally after registration, which could lead to stale or incorrect
 * inference results.
 *
 * All cells containing ONNX.RUN formulas referencing the affected model
 * are flagged with severity "high".
 *
 * Requirements: 8.3
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import type { ModelAsset } from '@/onnx/types'
import { findingId } from '../utils'

/**
 * Context extension providing model asset information for hash validation.
 * The caller supplies this via the context object or as a closure-captured dependency.
 */
export interface ModelHashContext {
  /** All registered model assets in the workbook, keyed by name */
  modelAssets: Record<string, ModelAsset>
  /** Get the current SHA-256 hash of a model's file on disk/in storage */
  getCurrentHash: (modelName: string) => string | null
}

/**
 * Extract the model name from an ONNX.RUN formula.
 * Handles both quoted and unquoted model names:
 *   ONNX.RUN("model_name", ...)
 *   ONNX.RUN('model_name', ...)
 *   ONNX.RUN(model_name, ...)
 */
function extractModelName(formula: string): string | null {
  const match = formula.match(/^ONNX\.RUN\(\s*["']?([a-zA-Z0-9_]+)["']?\s*[,)]/i)
  return match ? match[1] : null
}

/**
 * Find all cells that reference a specific model via ONNX.RUN formulas.
 */
function findCellsReferencingModel(formulaCells: CellInfo[], modelName: string): CellInfo[] {
  return formulaCells.filter((cell) => {
    if (!cell.formula) return false
    const name = extractModelName(cell.formula)
    return name !== null && name.toLowerCase() === modelName.toLowerCase()
  })
}

/**
 * Create the model hash mismatch rule.
 *
 * Because this rule requires model asset data that isn't part of the standard
 * AuditContext, it's created via a factory function that captures the
 * ModelHashContext. If no context is provided, the rule produces no findings.
 */
export function createModelHashMismatchRule(hashCtx?: ModelHashContext): AuditRule {
  return {
    id: 'model-hash-mismatch',
    name: 'Model Hash Mismatch',
    description: 'Detects when a model file has been modified after registration',
    defaultSeverity: 'high',

    run(ctx: AuditContext): AuditFinding[] {
      if (!hashCtx) return []

      const { modelAssets, getCurrentHash } = hashCtx
      const findings: AuditFinding[] = []

      for (const [modelName, asset] of Object.entries(modelAssets)) {
        const currentHash = getCurrentHash(modelName)

        // If we can't determine current hash, skip (file may be missing)
        if (currentHash === null) continue

        // Compare registered hash vs current file hash
        if (currentHash === asset.hash) continue

        // Hash mismatch detected — find all referencing cells
        const referencingCells = findCellsReferencingModel(ctx.formulaCells, modelName)

        if (referencingCells.length === 0) continue

        const cellAddresses = referencingCells.map((c) => c.cellId).join(', ')

        findings.push({
          id: findingId(),
          ruleId: 'model-hash-mismatch',
          severity: 'high',
          title: `Model "${modelName}" has been modified externally`,
          message: `The model file for "${modelName}" has changed since registration (hash mismatch). Cells using this model may produce stale or incorrect results: ${cellAddresses}`,
          cells: referencingCells.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
          suggestion: `Re-upload the model "${modelName}" to update the registered hash, or verify the external modification was intentional`,
          autoFixable: false,
        })
      }

      return findings
    },
  }
}

/**
 * Default instance with no model context (for static registration in ALL_RULES).
 * In practice, this rule is instantiated with model context at audit time.
 */
export const modelHashMismatchRule: AuditRule = createModelHashMismatchRule()
