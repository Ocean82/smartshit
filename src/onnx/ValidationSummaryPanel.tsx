/**
 * Validation Summary Panel
 *
 * Displays input validation results for ONNX inference:
 * - Invalid cells with visually distinct indicators in the grid
 * - Summary panel listing each invalid cell reference and its error
 * - Skipped formula error cells with their error types
 * - Shape satisfaction errors when insufficient valid data remains
 *
 * Requirements: 5.4, 5.5, 5.6
 */

import type { ValidationError } from './types';
import type { ValidationResult } from './inputValidator';
import { AlertTriangle, XCircle, SkipForward, Grid3X3 } from 'lucide-react';

// ─── Invalid Cell Styles ─────────────────────────────────────────────────────

/**
 * CSS class name for marking invalid cells in the spreadsheet grid.
 * Apply this to cell elements that failed validation.
 *
 * Style: 2px solid red border with a light red background tint.
 */
export const INVALID_CELL_CLASS = 'onnx-invalid-cell';

/**
 * Inline style object for marking invalid cells in the spreadsheet grid.
 * Use when Tailwind classes are not sufficient or when dynamically applying styles.
 *
 * Provides a visually distinct red border + light background per Requirement 5.4.
 */
export const invalidCellStyle: React.CSSProperties = {
  outline: '2px solid var(--error, #dc2626)',
  outlineOffset: '-1px',
  backgroundColor: 'var(--error-bg, rgba(220, 38, 38, 0.08))',
};

/**
 * Tailwind utility classes for marking an invalid cell in the grid.
 * Combines a red ring indicator with a subtle background tint.
 */
export const INVALID_CELL_TAILWIND = 'ring-2 ring-red-500 ring-inset bg-red-50/50';

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ValidationErrorItemProps {
  error: ValidationError;
}

function ValidationErrorItem({ error }: ValidationErrorItemProps) {
  const reasonLabel = getReasonLabel(error.reason);

  return (
    <li
      className="flex items-start gap-2 px-2 py-1.5 rounded text-xs"
      style={{ background: 'var(--error-bg, rgba(220, 38, 38, 0.05))' }}
    >
      <XCircle
        size={13}
        className="mt-0.5 shrink-0"
        style={{ color: 'var(--error, #dc2626)' }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-medium" style={{ color: 'var(--neutral-800, #1f2937)' }}>
          {error.cellId ? (
            <span className="font-mono text-[11px]">{error.cellId}</span>
          ) : (
            <span>Shape Error</span>
          )}
          {error.cellId && (
            <span
              className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-normal"
              style={{
                background: 'var(--neutral-100, #f3f4f6)',
                color: 'var(--neutral-500, #6b7280)',
              }}
            >
              {reasonLabel}
            </span>
          )}
        </span>
        <span
          className="text-[11px] leading-tight"
          style={{ color: 'var(--neutral-600, #4b5563)' }}
        >
          {error.message}
        </span>
      </div>
    </li>
  );
}

interface SkippedCellItemProps {
  cellId: string;
  errorType: string;
}

function SkippedCellItem({ cellId, errorType }: SkippedCellItemProps) {
  return (
    <li
      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
      style={{ background: 'var(--warning-bg, rgba(234, 179, 8, 0.05))' }}
    >
      <SkipForward
        size={13}
        className="shrink-0"
        style={{ color: 'var(--warning, #ca8a04)' }}
        aria-hidden="true"
      />
      <span style={{ color: 'var(--neutral-700, #374151)' }}>
        <span className="font-mono text-[11px] font-medium">{cellId}</span>
        <span className="mx-1">—</span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--warning-text, #92400e)' }}>
          {errorType}
        </span>
        <span className="text-[11px] ml-1" style={{ color: 'var(--neutral-500, #6b7280)' }}>
          excluded from inference
        </span>
      </span>
    </li>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getReasonLabel(reason: ValidationError['reason']): string {
  switch (reason) {
    case 'non_numeric':
      return 'Non-numeric';
    case 'nan':
      return 'NaN';
    case 'empty':
      return 'Empty';
    case 'formula_error':
      return 'Formula error';
    case 'shape_mismatch':
      return 'Shape mismatch';
    default:
      return 'Invalid';
  }
}

/**
 * Determines if a cellId is in the list of invalid cells.
 * Useful for conditionally applying the invalid cell indicator to grid cells.
 */
export function isInvalidCell(cellId: string, validationResult: ValidationResult): boolean {
  return validationResult.errors.some((e) => e.cellId === cellId);
}

/**
 * Determines if a cellId was skipped due to a formula error.
 */
export function isSkippedCell(cellId: string, validationResult: ValidationResult): boolean {
  return validationResult.skippedCells?.some((s) => s.cellId === cellId) ?? false;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface ValidationSummaryPanelProps {
  /** Validation result from inputValidator.validateAndConstructTensor */
  validationResult: ValidationResult;
  /** Optional: Expected input shape for contextual error messaging */
  expectedShape?: number[];
  /** Called when the user clicks on a cell reference to navigate to it */
  onCellClick?: (cellId: string) => void;
  /** Whether the panel is open/visible */
  visible?: boolean;
  /** Called when the user dismisses the panel */
  onDismiss?: () => void;
}

export function ValidationSummaryPanel({
  validationResult,
  expectedShape,
  onCellClick: _onCellClick,
  visible = true,
  onDismiss,
}: ValidationSummaryPanelProps) {
  if (!visible) return null;

  const { errors, skippedCells, shapesSatisfied } = validationResult;

  const cellErrors = errors.filter((e) => e.reason !== 'shape_mismatch');
  const shapeMismatchErrors = errors.filter((e) => e.reason === 'shape_mismatch');
  const hasSkippedCells = skippedCells && skippedCells.length > 0;
  const hasErrors = cellErrors.length > 0;
  const hasShapeError = !shapesSatisfied || shapeMismatchErrors.length > 0;

  // Nothing to show
  if (!hasErrors && !hasSkippedCells && !hasShapeError) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-lg border text-sm"
      style={{
        background: 'var(--surface, #ffffff)',
        borderColor: 'var(--error-border, #fca5a5)',
      }}
      role="region"
      aria-label="Input validation errors"
      data-testid="validation-summary-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={15}
            style={{ color: 'var(--error, #dc2626)' }}
            aria-hidden="true"
          />
          <span
            className="font-medium text-xs"
            style={{ color: 'var(--neutral-800, #1f2937)' }}
          >
            Input Validation Failed
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: 'var(--error-bg, rgba(220, 38, 38, 0.1))',
              color: 'var(--error, #dc2626)',
            }}
          >
            {cellErrors.length + (hasSkippedCells ? skippedCells!.length : 0)} issue
            {cellErrors.length + (hasSkippedCells ? skippedCells!.length : 0) !== 1 ? 's' : ''}
          </span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-0.5 rounded transition-colors hover:bg-neutral-100"
            aria-label="Dismiss validation panel"
          >
            <XCircle size={14} style={{ color: 'var(--neutral-400, #9ca3af)' }} />
          </button>
        )}
      </div>

      {/* Shape Mismatch Error (Requirement 5.6) */}
      {hasShapeError && (
        <div
          className="flex items-start gap-2 px-2.5 py-2 rounded text-xs"
          style={{
            background: 'var(--error-bg, rgba(220, 38, 38, 0.06))',
            border: '1px solid var(--error-border, #fecaca)',
          }}
          role="alert"
          data-testid="shape-error"
        >
          <Grid3X3
            size={13}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--error, #dc2626)' }}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium" style={{ color: 'var(--error, #dc2626)' }}>
              Insufficient valid data for model input
            </span>
            {shapeMismatchErrors.length > 0 ? (
              <span style={{ color: 'var(--neutral-600, #4b5563)' }}>
                {shapeMismatchErrors[0].message}
              </span>
            ) : expectedShape ? (
              <span style={{ color: 'var(--neutral-600, #4b5563)' }}>
                Expected shape [{expectedShape.join(', ')}] but only{' '}
                {cellErrors.length > 0
                  ? `${errors.filter((e) => e.reason === 'shape_mismatch').length > 0 ? (errors.find((e) => e.reason === 'shape_mismatch')?.value as number ?? 0) : 0} valid cells remain`
                  : '0 valid cells remain'}
              </span>
            ) : (
              <span style={{ color: 'var(--neutral-600, #4b5563)' }}>
                Remaining valid cells do not satisfy the model&apos;s expected input shape
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cell Validation Errors (Requirement 5.4) */}
      {hasErrors && (
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-medium uppercase tracking-wide px-1"
            style={{ color: 'var(--neutral-500, #6b7280)' }}
          >
            Invalid Cells
          </span>
          <ul className="flex flex-col gap-0.5" role="list" aria-label="Invalid cells list">
            {cellErrors.map((error, index) => (
              <ValidationErrorItem key={`${error.cellId}-${index}`} error={error} />
            ))}
          </ul>
        </div>
      )}

      {/* Skipped Formula Error Cells (Requirement 5.5) */}
      {hasSkippedCells && (
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-medium uppercase tracking-wide px-1"
            style={{ color: 'var(--warning, #ca8a04)' }}
          >
            Skipped Cells (Formula Errors)
          </span>
          <ul className="flex flex-col gap-0.5" role="list" aria-label="Skipped cells list">
            {skippedCells!.map((cell, index) => (
              <SkippedCellItem key={`${cell.cellId}-${index}`} cellId={cell.cellId} errorType={cell.errorType} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
