import type { CellData } from '@/types';

/** Check if a cell value represents the "checked" state for a checkbox validation. */
export function isCellChecked(value: string | number | boolean | null | undefined, checkedValue?: string): boolean {
  const checked = checkedValue ?? 'TRUE'
  const current = String(value ?? '').toUpperCase()
  return current === checked.toUpperCase() || current === '1' || current === 'YES' || current === 'TRUE'
}

/** Compute the new value when a checkbox cell is toggled. */
export function getCheckboxToggleValue(cellData: CellData): string {
  const checked = cellData.validation?.checkedValue ?? 'TRUE'
  const unchecked = cellData.validation?.uncheckedValue ?? 'FALSE'
  const isChecked = cellData.value === checked ||
    (typeof cellData.value === 'string' && cellData.value.toUpperCase() === checked.toUpperCase()) ||
    cellData.value === 1 || cellData.value === true
  return isChecked ? unchecked : checked
}
