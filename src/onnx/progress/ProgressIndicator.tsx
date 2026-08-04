/**
 * ONNX Inference Progress Indicator UI Component.
 *
 * Displays:
 * - Indeterminate progress indicator for Path A (local/Web Worker)
 * - Determinate progress bar with percentage for Path B (SSE chunks)
 * - Cancel button adjacent to progress indicator for entire operation duration
 * - Path indicator badge (Local/Server) visible for min 2 seconds
 * - Execution time in status bar on completion (formatted: <60s → "2.3s", ≥60s → "1m 12.0s")
 * - Non-blocking "Switch to server?" suggestion after 60s on Path A
 * - Cache status (memory MB + session count) in status bar area
 * - Loading indicator during model initialization
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 4.4, 9.4, 1.8
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOnnxProgressStore } from './progressStore';
import type { ExecutionPath } from '../types';
import { X, Cpu, Server, Loader2, Clock, Database, ArrowRightLeft } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats execution time per requirement 12.3:
 * - < 60s → seconds with one decimal (e.g., "2.3s")
 * - ≥ 60s → minutes and seconds (e.g., "1m 12.0s")
 */
export function formatExecutionTime(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

/** Threshold in ms after which we suggest switching to Path B (Requirement 12.4) */
const PATH_A_SUGGESTION_THRESHOLD_MS = 60_000;

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PathBadgeProps {
  path: ExecutionPath;
}

function PathBadge({ path }: PathBadgeProps) {
  const isLocal = path === 'local';
  const Icon = isLocal ? Cpu : Server;
  const label = isLocal ? 'Local' : 'Server';
  const bgColor = isLocal ? 'var(--info-bg, #eff6ff)' : 'var(--success-bg, #f0fdf4)';
  const textColor = isLocal ? 'var(--info, #2563eb)' : 'var(--success, #16a34a)';

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: bgColor, color: textColor }}
      aria-label={`Running inference ${isLocal ? 'locally in browser' : 'on server'}`}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

interface IndeterminateBarProps {
  /** Whether the component is in model loading state vs inference state */
  isModelLoading?: boolean;
}

function IndeterminateBar({ isModelLoading }: IndeterminateBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="relative w-16 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--neutral-200, #e5e7eb)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={isModelLoading ? 'Loading model' : 'Inference in progress'}
      >
        <div
          className="absolute h-full w-6 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]"
          style={{ background: 'var(--accent-500, #6366f1)' }}
        />
      </div>
      <span className="text-[10px]" style={{ color: 'var(--neutral-500)' }}>
        {isModelLoading ? 'Loading model…' : 'Computing…'}
      </span>
    </div>
  );
}

interface DeterminateBarProps {
  progress: number;
}

function DeterminateBar({ progress }: DeterminateBarProps) {
  const pct = Math.round(progress);
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="relative w-16 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--neutral-200, #e5e7eb)' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Inference ${pct}% complete`}
      >
        <div
          className="absolute h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: 'var(--accent-500, #6366f1)',
          }}
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--neutral-600)' }}>
        {pct}%
      </span>
    </div>
  );
}

interface CancelButtonProps {
  onCancel: () => void;
}

function CancelButton({ onCancel }: CancelButtonProps) {
  return (
    <button
      type="button"
      onClick={onCancel}
      className="p-0.5 rounded transition-colors hover:bg-red-50 group"
      title="Cancel inference"
      aria-label="Cancel inference"
    >
      <X size={12} className="text-neutral-400 group-hover:text-red-500 transition-colors" />
    </button>
  );
}

interface SwitchToServerSuggestionProps {
  onSwitch: () => void;
}

function SwitchToServerSuggestion({ onSwitch }: SwitchToServerSuggestionProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px]"
      style={{ background: 'var(--warning-bg, #fffbeb)', color: 'var(--warning-text, #92400e)' }}
      role="alert"
      aria-live="polite"
    >
      <ArrowRightLeft size={10} />
      <span>Taking long — switch to server?</span>
      <button
        type="button"
        onClick={onSwitch}
        className="font-medium underline hover:no-underline"
        aria-label="Re-submit operation via server"
      >
        Re-submit
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface ProgressIndicatorProps {
  /** Called when user cancels; receives the cell ID of the operation to cancel */
  onCancel?: (cellId: string) => void;
  /** Called when user opts to re-submit via server (Path B) after 60s on Path A */
  onSwitchToServer?: (cellId: string) => void;
  /** If true, display model loading state instead of inference progress */
  isModelLoading?: boolean;
  /** Last completed execution time (ms) — shown in status bar area after completion */
  lastExecutionTimeMs?: number | null;
}

export function ProgressIndicator({
  onCancel,
  onSwitchToServer,
  isModelLoading = false,
  lastExecutionTimeMs = null,
}: ProgressIndicatorProps) {
  const { activeInferences, cacheStatus, pathIndicator } = useOnnxProgressStore();

  // Track elapsed time for Path A suggestion (Requirement 12.4)
  const [elapsedMs, setElapsedMs] = useState(0);

  // Get the first active inference for display (primary)
  const entries = useMemo(() => Array.from(activeInferences.entries()), [activeInferences]);
  const primaryEntry = entries.length > 0 ? entries[0] : null;
  const primaryCellId = primaryEntry?.[0] ?? null;
  const primaryInference = primaryEntry?.[1] ?? null;

  // Elapsed time ticker for Path A operations
  useEffect(() => {
    if (!primaryInference || primaryInference.path !== 'local') {
      setElapsedMs(0);
      return;
    }

    const startedAt = primaryInference.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [primaryInference]);

  const handleCancel = useCallback(() => {
    if (primaryCellId && onCancel) {
      onCancel(primaryCellId);
    }
  }, [primaryCellId, onCancel]);

  const handleSwitchToServer = useCallback(() => {
    if (primaryCellId && onSwitchToServer) {
      onSwitchToServer(primaryCellId);
    }
  }, [primaryCellId, onSwitchToServer]);

  const showSuggestion =
    primaryInference?.path === 'local' && elapsedMs >= PATH_A_SUGGESTION_THRESHOLD_MS;

  const hasActiveInference = entries.length > 0;
  const showProgress = hasActiveInference || isModelLoading;

  return (
    <div
      className="flex items-center gap-2 text-[10px]"
      data-testid="onnx-progress-indicator"
    >
      {/* Model loading indicator (Requirement 1.8) */}
      {isModelLoading && !hasActiveInference && (
        <div className="flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent-500)' }} />
          <span style={{ color: 'var(--neutral-500)' }}>Initializing model…</span>
        </div>
      )}

      {/* Path indicator badge (Requirement 4.4) */}
      {pathIndicator?.visible && pathIndicator.path && (
        <PathBadge path={pathIndicator.path} />
      )}

      {/* Progress indicator (Requirement 12.1, 12.5) */}
      {hasActiveInference && primaryInference && (
        <>
          {primaryInference.progress === -1 ? (
            <IndeterminateBar />
          ) : (
            <DeterminateBar progress={primaryInference.progress} />
          )}

          {/* Cancel button (Requirement 12.2) — always visible during active inference */}
          <CancelButton onCancel={handleCancel} />
        </>
      )}

      {/* Switch to server suggestion (Requirement 12.4) */}
      {showSuggestion && <SwitchToServerSuggestion onSwitch={handleSwitchToServer} />}

      {/* Execution time display (Requirement 12.3) */}
      {!showProgress && lastExecutionTimeMs != null && lastExecutionTimeMs > 0 && (
        <span
          className="flex items-center gap-1"
          style={{ color: 'var(--neutral-500)' }}
          title="Last inference execution time"
        >
          <Clock size={10} />
          {formatExecutionTime(lastExecutionTimeMs)}
        </span>
      )}

      {/* Cache status (Requirement 9.4) */}
      {cacheStatus.sessionCount > 0 && (
        <span
          className="flex items-center gap-1"
          style={{ color: 'var(--neutral-400)' }}
          title={`Model cache: ${cacheStatus.totalMemoryMB.toFixed(1)}MB across ${cacheStatus.sessionCount} model${cacheStatus.sessionCount !== 1 ? 's' : ''}`}
        >
          <Database size={10} />
          <span className="tabular-nums">
            {cacheStatus.totalMemoryMB.toFixed(0)}MB / {cacheStatus.sessionCount}{' '}
            {cacheStatus.sessionCount === 1 ? 'model' : 'models'}
          </span>
        </span>
      )}
    </div>
  );
}
