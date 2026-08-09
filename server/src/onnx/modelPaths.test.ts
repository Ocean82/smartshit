/**
 * Unit tests for ONNX model path resolution.
 * Uses a temp directory — no real MiniLM binary required.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveOnnxModelPath, getOnnxModelSize } from './modelPaths.js'

describe('resolveOnnxModelPath', () => {
  let modelsRoot: string

  beforeEach(() => {
    modelsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onnx-models-'))
  })

  afterEach(() => {
    fs.rmSync(modelsRoot, { recursive: true, force: true })
  })

  it('prefers nested {name}/model.onnx over flat {name}.onnx', () => {
    const nestedDir = path.join(modelsRoot, 'minilm')
    fs.mkdirSync(nestedDir)
    const nestedPath = path.join(nestedDir, 'model.onnx')
    fs.writeFileSync(nestedPath, 'nested')
    fs.writeFileSync(path.join(modelsRoot, 'minilm.onnx'), 'flat')

    expect(resolveOnnxModelPath(modelsRoot, 'minilm')).toBe(nestedPath)
  })

  it('falls back to flat {name}.onnx when nested is missing', () => {
    const flatPath = path.join(modelsRoot, 'minilm.onnx')
    fs.writeFileSync(flatPath, 'flat')

    expect(resolveOnnxModelPath(modelsRoot, 'minilm')).toBe(flatPath)
  })

  it('returns flat path even when neither file exists', () => {
    expect(resolveOnnxModelPath(modelsRoot, 'missing')).toBe(
      path.join(modelsRoot, 'missing.onnx'),
    )
  })
})

describe('getOnnxModelSize', () => {
  let modelsRoot: string

  beforeEach(() => {
    modelsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onnx-models-'))
  })

  afterEach(() => {
    fs.rmSync(modelsRoot, { recursive: true, force: true })
  })

  it('returns size of nested model.onnx', async () => {
    const nestedDir = path.join(modelsRoot, 'minilm')
    fs.mkdirSync(nestedDir)
    const content = Buffer.alloc(42, 1)
    fs.writeFileSync(path.join(nestedDir, 'model.onnx'), content)

    expect(await getOnnxModelSize(modelsRoot, 'minilm')).toBe(42)
  })

  it('returns 0 when model file is missing', async () => {
    expect(await getOnnxModelSize(modelsRoot, 'absent')).toBe(0)
  })
})
