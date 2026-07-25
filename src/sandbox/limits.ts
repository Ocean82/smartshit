/**
 * Sandbox Execution Engine — Resource Limits
 *
 * Hard limits to prevent runaway scripts from degrading the app.
 */

/** Maximum execution time before the script is terminated (ms). */
export const EXECUTION_TIMEOUT_MS = 5_000

/** Maximum memory the QuickJS VM can allocate (bytes). 16 MB. */
export const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024

/** Maximum number of cell mutations a single script can produce. */
export const MAX_MUTATIONS = 50_000

/** Maximum number of log lines a script can emit. */
export const MAX_LOG_LINES = 200

/** Maximum stack depth for the QuickJS runtime. */
export const MAX_STACK_SIZE = 512 * 1024 // 512 KB stack

/**
 * Interrupt interval — QuickJS checks for timeout every N instructions.
 * Lower = more responsive timeout detection, slightly slower execution.
 */
export const INTERRUPT_INTERVAL_MS = 100
