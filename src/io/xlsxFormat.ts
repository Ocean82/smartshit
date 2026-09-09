/**
 * Mappers between the app's CellFormat and Excel alignment semantics.
 *
 * NOTE: styled *export* is intentionally deferred (SheetJS community builds
 * cannot write cell styles to .xlsx; see docs/superpowers/plans/2026-09-09-cellformat-parity.md).
 * This module currently only serves the import side; the export mapper
 * (cellFormatToXlsxStyle, border parsing, hex normalization) will land with
 * that follow-up milestone.
 */

import type { CellFormat } from '@/types'

/** Map an Excel vertical alignment value to the app enum (center -> middle). */
export function mapExcelVerticalAlign(vertical: string | undefined): CellFormat['verticalAlign'] {
  if (vertical === 'top' || vertical === 'bottom') return vertical
  if (vertical === 'center') return 'middle'
  return undefined
}