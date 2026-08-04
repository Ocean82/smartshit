/**
 * Model Asset Registry
 *
 * CRUD operations for ONNX model assets stored in WorkbookData.modelAssets.
 * Pure data layer — does not interact with the formula engine directly.
 * Deletion cascade (#REF!) is signaled by returning affected cells; the caller
 * is responsible for marking those cells.
 */

import type { ModelAsset } from './types';

/** Regex for valid model names: 1–64 alphanumeric/underscore characters */
const MODEL_NAME_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;

export interface ModelAssetsAccessor {
  /** Read the current model assets map from workbook metadata */
  get(): Record<string, ModelAsset>;
  /** Write an updated model assets map to workbook metadata */
  set(assets: Record<string, ModelAsset>): void;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  /** Cell references that now have #REF! errors due to model deletion */
  affectedCells: string[];
}

export class ModelAssetRegistry {
  private accessor: ModelAssetsAccessor;

  constructor(accessor: ModelAssetsAccessor) {
    this.accessor = accessor;
  }

  /**
   * Validate that a model name conforms to ^[a-zA-Z0-9_]{1,64}$.
   */
  validateName(name: string): boolean {
    return MODEL_NAME_PATTERN.test(name);
  }

  /**
   * Compute the SHA-256 hash of a model binary as a hex string.
   */
  async computeHash(binary: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', binary);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Register a model asset in the workbook.
   * Validates name format, rejects duplicates.
   */
  register(name: string, asset: ModelAsset): RegisterResult {
    if (!this.validateName(name)) {
      return {
        success: false,
        error: `Invalid model name "${name}". Must match ^[a-zA-Z0-9_]{1,64}$.`,
      };
    }

    const assets = this.accessor.get();

    if (Object.prototype.hasOwnProperty.call(assets, name)) {
      return {
        success: false,
        error: `A model asset with name "${name}" already exists.`,
      };
    }

    const updated = { ...assets, [name]: asset };
    this.accessor.set(updated);

    return { success: true };
  }

  /**
   * Retrieve a model asset by name.
   * Returns null if not found.
   */
  get(name: string): ModelAsset | null {
    const assets = this.accessor.get();
    return Object.prototype.hasOwnProperty.call(assets, name) ? assets[name] : null;
  }

  /**
   * Delete a model asset by name.
   * Uses findReferencingCells callback to determine which cells reference this model,
   * returning the list of affected cells that should show #REF!.
   */
  delete(
    name: string,
    findReferencingCells: (modelName: string) => string[],
  ): DeleteResult {
    const assets = this.accessor.get();

    if (!Object.prototype.hasOwnProperty.call(assets, name)) {
      return { success: false, affectedCells: [] };
    }

    const affectedCells = findReferencingCells(name);

    const { [name]: _removed, ...remaining } = assets;
    this.accessor.set(remaining);

    return { success: true, affectedCells };
  }

  /**
   * List all registered model assets.
   */
  list(): ModelAsset[] {
    const assets = this.accessor.get();
    return Object.values(assets);
  }
}
