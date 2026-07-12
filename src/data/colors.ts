/**
 * Shared color palettes used across toolbar, format panel, and other UI.
 * Defined once to avoid duplication.
 */

/** 21-color palette for font color and fill (full spectrum). */
export const FULL_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6D00', '#FFAB00', '#FFD600', '#AEEA00', '#00C853', '#00BFA5',
  '#2979FF', '#304FFE', '#651FFF', '#AA00FF', '#D500F9', '#F50057', '#FF1744',
] as const

/** 14-color palette for cell background (lighter, softer). */
export const BG_COLORS = [
  '#FFFFFF', '#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#EDE9FE',
  '#FCE7F3', '#F3F4F6', '#FCA5A5', '#FCD34D', '#6EE7B7', '#93C5FD',
  '#C4B5FD', '#F9A8D4',
] as const
