import React from 'react';
import type { CellFormat } from '@/types';

export const NUMBER_FORMATS = [
  { value: '', label: 'General' },
  { value: 'number', label: 'Number (1,234.50)' },
  { value: 'currency', label: 'Currency ($1,234.56)' },
  { value: 'percent', label: 'Percentage (0.12 or 12 → 12%)' },
  { value: 'date', label: 'Date (07/11/2026)' },
  { value: 'text', label: 'Text (@)' },
] as const;

/**
 * Coerce a raw cell value to an analysis-friendly scalar.
 * Booleans become their spreadsheet display form ("TRUE"/"FALSE") so downstream
 * matrices and profilers can stay typed as `string | number | null`.
 */
export function cellScalar(value: string | number | boolean | null | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}

export function formatCellValue(value: string | number | boolean | null, numberFormat?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (!numberFormat || numberFormat === '') return String(value);

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  switch (numberFormat) {
    case 'number':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'currency':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    case 'percent': {
      if (isNaN(num)) return String(value);
      // |n| <= 1 → ratio (0.12 → 12%); otherwise percent points (12 → 12%)
      const ratio = Math.abs(num) <= 1 ? num : num / 100;
      return ratio.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 2 });
    }
    case 'date': {
      if (typeof value === 'string') {
        const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
        if (isoDay) {
          const date = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
          return date.toLocaleDateString('en-US')
        }
        const parsed = Date.parse(value)
        if (!Number.isNaN(parsed)) {
          return new Date(parsed).toLocaleDateString('en-US')
        }
        const asNum = parseFloat(value)
        if (!isNaN(asNum)) {
          const date = new Date(asNum)
          if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US')
        }
        return String(value)
      }
      if (typeof value === 'number') {
        const date = new Date(value)
        if (isNaN(date.getTime())) return String(value)
        return date.toLocaleDateString('en-US')
      }
      return String(value)
    }
    case 'text':
      return String(value);
    default:
      return String(value);
  }
}

function isActiveBorder(value?: string): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getBorderCSS(borders?: CellFormat['borders']): React.CSSProperties {
  if (!borders) return {};
  const css: React.CSSProperties = {};
  if (isActiveBorder(borders.top)) css.borderTop = borders.top;
  if (isActiveBorder(borders.right)) css.borderRight = borders.right;
  if (isActiveBorder(borders.bottom)) css.borderBottom = borders.bottom;
  if (isActiveBorder(borders.left)) css.borderLeft = borders.left;
  return css;
}
