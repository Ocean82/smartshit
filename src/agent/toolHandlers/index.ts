/**
 * Tool handler dispatch registry.
 * Maps resolved tool names to their handler functions.
 */
import type { ToolHandler } from './types'

import { handleSetCell, handleSetRange, handleAddRow, handleDeleteRow } from './cellOps'
import { handleRenameHeader, handleModifyColumn, handleApplyFormula } from './columnOps'
import { handleClearSheet, handleRenameSheet, handleSortSheet, handleMultiSort } from './sheetOps'
import { handleFormulaAnalyzer, handleCountRows, handleFindMax, handleFindMin } from './queryOps'
import { handleMultiSheetJoin } from './joinOps'
import { handleFormatCells, handleFormatAsTable } from './formatOps'
import {
  handleFilter,
  handleFindAndReplace,
  handleExportData,
  handleAddNote,
  handleRemoveNote,
  handleSetCheckbox,
} from './miscOps'

/** Registry of all tool handlers keyed by resolved tool name. */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  set_cell: handleSetCell,
  set_range: handleSetRange,
  add_row: handleAddRow,
  delete_row: handleDeleteRow,
  rename_header: handleRenameHeader,
  modify_column: handleModifyColumn,
  apply_formula: handleApplyFormula,
  clear_sheet: handleClearSheet,
  rename_sheet: handleRenameSheet,
  sort_sheet: handleSortSheet,
  multi_sort: handleMultiSort,
  formula_analyzer: handleFormulaAnalyzer,
  count_rows: handleCountRows,
  find_max: handleFindMax,
  find_min: handleFindMin,
  multi_sheet_join: handleMultiSheetJoin,
  format_cells: handleFormatCells,
  format_as_table: handleFormatAsTable,
  filter: handleFilter,
  find_and_replace: handleFindAndReplace,
  export_data: handleExportData,
  add_note: handleAddNote,
  remove_note: handleRemoveNote,
  set_checkbox: handleSetCheckbox,
}

export type { ToolHandler, ToolParams } from './types'
export { applyBulk, requireCellRef, requireColumn, resolveColumnIndex } from './types'
