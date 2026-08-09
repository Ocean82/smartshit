/**
 * Resolve ONNX model file paths under server/models.
 *
 * Preferred layout:  models/{name}/model.onnx
 * Flat fallback:     models/{name}.onnx
 */

import fs from 'node:fs'
import path from 'node:path'

/** Resolve a model name to an absolute (or root-relative) .onnx path. */
export function resolveOnnxModelPath(modelsRoot: string, name: string): string {
  const nested = path.join(modelsRoot, name, 'model.onnx')
  if (fs.existsSync(nested)) return nested
  return path.join(modelsRoot, `${name}.onnx`)
}

/** Return model file size in bytes, or 0 if missing/unreadable. */
export async function getOnnxModelSize(modelsRoot: string, name: string): Promise<number> {
  const modelPath = resolveOnnxModelPath(modelsRoot, name)
  try {
    return (await fs.promises.stat(modelPath)).size
  } catch {
    return 0
  }
}
