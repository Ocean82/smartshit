/**
 * Pure render helpers for the parity CellFormat fields.
 * Kept framework-free so they are unit-testable and shared by GridCell,
 * ReadOnlyGrid, and any future renderers.
 */

import type { CellFormat } from '@/types'

/**
 * Combine underline + strikethrough into a single CSS text-decoration value.
 * Order is stable ("underline line-through") so outputs are deterministic.
 */
export function textDecorationStyle(format: Pick<CellFormat, 'underline' | 'strikethrough'> | undefined): string {
  if (!format) return ''
  const parts: string[] = []
  if (format.underline) parts.push('underline')
  if (format.strikethrough) parts.push('line-through')
  return parts.join(' ')
}

/**
 * Map the spreadsheet vertical-alignment enum to a flexbox justify value.
 * Returns undefined when unset so callers keep their existing default centering.
 */
export function verticalAlignToCSS(verticalAlign: CellFormat['verticalAlign']): 'flex-start' | 'center' | 'flex-end' | undefined {
  switch (verticalAlign) {
    case 'top':
      return 'flex-start'
    case 'middle':
      return 'center'
    case 'bottom':
      return 'flex-end'
    default:
      return undefined
  }
}

/** True when wrapped text rendering is enabled for the cell. */
export function isWrapEnabled(format: Pick<CellFormat, 'textWrap'> | undefined): boolean {
  return format?.textWrap === true
}