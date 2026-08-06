/**
 * Type stub for onnxruntime-node.
 *
 * The full package is not installed yet (server-side ONNX Path B is pending).
 * This stub allows the TypeScript compiler to pass without errors while
 * the sessionPool.ts code exists but is not yet wired into the runtime.
 */
declare module 'onnxruntime-node' {
  export interface InferenceSession {
    run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>
    release(): void
    dispose(): void
  }

  export namespace InferenceSession {
    function create(path: string): Promise<InferenceSession>
  }
}
