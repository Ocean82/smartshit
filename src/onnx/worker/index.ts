/**
 * ONNX Worker Module
 *
 * Web Worker entry point and bridge for isolated in-browser inference.
 * Exports message types, error classification utilities, and the worker bridge.
 */

export type { WorkerMessage, WorkerResponse, ErrorCode } from './workerErrors';
export { classifyError } from './workerErrors';
export { OnnxWorkerBridge } from './workerBridge';
