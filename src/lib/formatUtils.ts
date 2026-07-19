import React from 'react';
import type { CellFormat } from '@/types';

export interface NumberFormatOption {
  value: string;
  label: string;
  group: string;
}

export const NUMBER_FORMAT_GROUPS = [
  'General',
  'Number',
  'Currency',
  'Accounting',
  'Date',
  'Time',
  'Percentage',
  'Fraction',
  'Scientific',
  'Text',
] as const;

export const NUMBER_FORMATS: NumberFormatOption[] = [
  // General
  { value: '', label: 'General', group: 'General' },

  // Number
  { value: 'number', label: '1,234.50', group: 'Number' },
  { value: 'number-int', label: '1,235 (no decimals)', group: 'Number' },
  { value: 'number-neg-red', label: '1,234.50 / -1,234.50 (red)', group: 'Number' },

  // Currency
  { value: 'currency', label: '$1,234.56', group: 'Currency' },
  { value: 'currency-int', label: '$1,235 (no decimals)', group: 'Currency' },
  { value: 'currency-gbp', label: '£1,234.56', group: 'Currency' },
  { value: 'currency-eur', label: '€1,234.56', group: 'Currency' },
  { value: 'currency-jpy', label: '¥1,235 (JPY)', group: 'Currency' },

  // Accounting
  { value: 'accounting', label: '$ 1,234.56 (accounting)', group: 'Accounting' },
  { value: 'accounting-neg', label: '$ (1,234.56) negatives in parens', group: 'Accounting' },

  // Date
  { value: 'date', label: '7/11/2026', group: 'Date' },
  { value: 'date-iso', label: '2026-07-11', group: 'Date' },
  { value: 'date-long', label: 'July 11, 2026', group: 'Date' },
  { value: 'date-short-eu', label: '11/07/2026 (DD/MM)', group: 'Date' },
  { value: 'date-mmm-yy', label: 'Jul-26', group: 'Date' },
  { value: 'date-d-mmm', label: '11-Jul', group: 'Date' },

  // Time
  { value: 'time', label: '3:45 PM', group: 'Time' },
  { value: 'time-24', label: '15:45', group: 'Time' },
  { value: 'time-seconds', label: '3:45:30 PM', group: 'Time' },
  { value: 'datetime', label: '7/11/2026 3:45 PM', group: 'Time' },

  // Percentage
  { value: 'percent', label: '12.35%', group: 'Percentage' },
  { value: 'percent-int', label: '12% (no decimals)', group: 'Percentage' },

  // Fraction
  { value: 'fraction', label: '1/4, 3/8', group: 'Fraction' },

  // Scientific
  { value: 'scientific', label: '1.23E+03', group: 'Scientific' },

  // Text
  { value: 'text', label: 'Text (@)', group: 'Text' },
];

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
    // --- Number ---
    case 'number':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'number-int':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    case 'number-neg-red':
      // Returns the formatted string; red styling is handled at the cell render level
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // --- Currency ---
    case 'currency':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    case 'currency-int':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    case 'currency-gbp':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
    case 'currency-eur':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    case 'currency-jpy':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY' });

    // --- Accounting ---
    case 'accounting':
      if (isNaN(num)) return String(value);
      // Accounting style: aligned currency symbol, space-padded
      return formatAccounting(num, 'USD', false);
    case 'accounting-neg':
      if (isNaN(num)) return String(value);
      // Negatives in parentheses
      return formatAccounting(num, 'USD', true);

    // --- Date ---
    case 'date':
      return formatDateValue(value, 'en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    case 'date-iso':
      return formatDateValue(value, 'sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
    case 'date-long':
      return formatDateValue(value, 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    case 'date-short-eu':
      return formatDateValue(value, 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    case 'date-mmm-yy':
      return formatDateValue(value, 'en-US', { month: 'short', year: '2-digit' });
    case 'date-d-mmm':
      return formatDateValue(value, 'en-US', { day: 'numeric', month: 'short' });

    // --- Time ---
    case 'time':
      return formatTimeValue(value, 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    case 'time-24':
      return formatTimeValue(value, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    case 'time-seconds':
      return formatTimeValue(value, 'en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    case 'datetime':
      return formatDateTimeValue(value);

    // --- Percentage ---
    case 'percent': {
      if (isNaN(num)) return String(value);
      // |n| <= 1 → ratio (0.12 → 12%); otherwise percent points (12 → 12%)
      const ratio = Math.abs(num) <= 1 ? num : num / 100;
      return ratio.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 2 });
    }
    case 'percent-int': {
      if (isNaN(num)) return String(value);
      const ratio = Math.abs(num) <= 1 ? num : num / 100;
      return ratio.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    // --- Fraction ---
    case 'fraction':
      if (isNaN(num)) return String(value);
      return toFraction(num);

    // --- Scientific ---
    case 'scientific':
      if (isNaN(num)) return String(value);
      return num.toExponential(2).toUpperCase();

    // --- Text ---
    case 'text':
      return String(value);

    default:
      return String(value);
  }
}

/**
 * Determine if a number format with negative-red styling should render in red.
 * Used by the grid renderer to apply red font color.
 */
export function isNegativeRedFormat(numberFormat: string | undefined, value: string | number | boolean | null): boolean {
  if (numberFormat !== 'number-neg-red') return false;
  if (value === null || value === undefined) return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return !isNaN(num) && num < 0;
}

// --- Helpers ---

function formatAccounting(num: number, currency: string, parenNegatives: boolean): string {
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  const absFormatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) {
    return parenNegatives ? `${symbol} (${absFormatted})` : `${symbol} -${absFormatted}`;
  }
  if (num === 0) {
    return `${symbol} -`;
  }
  return `${symbol} ${absFormatted}`;
}

function parseDateFromValue(value: string | number | boolean | null): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;

  if (typeof value === 'string') {
    // ISO date: 2026-07-11
    const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (isoDay) {
      return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    }
    // ISO datetime: 2026-07-11T15:45:30
    const isoDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
    if (isoDateTime) {
      return new Date(
        Number(isoDateTime[1]), Number(isoDateTime[2]) - 1, Number(isoDateTime[3]),
        Number(isoDateTime[4]), Number(isoDateTime[5]), Number(isoDateTime[6] || 0)
      );
    }
    // Time-only: 15:45 or 3:45 PM or 15:45:30
    const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim());
    if (timeOnly) {
      let hours = Number(timeOnly[1]);
      const minutes = Number(timeOnly[2]);
      const seconds = Number(timeOnly[3] || 0);
      const ampm = timeOnly[4];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }
      const d = new Date(2000, 0, 1, hours, minutes, seconds);
      return d;
    }
    // General parse fallback
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return new Date(parsed);
    return null;
  }

  if (typeof value === 'number') {
    // Excel serial date: numbers between 1 and 2958465 (roughly 1900-9999)
    if (value >= 1 && value <= 2958465) {
      return excelSerialToDate(value);
    }
    // Unix timestamp fallback
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  return null;
}

function excelSerialToDate(serial: number): Date {
  // Excel epoch is Jan 1, 1900 (with the Lotus 1-2-3 leap year bug)
  const epoch = new Date(1899, 11, 30); // Dec 30, 1899
  const days = Math.floor(serial);
  const fraction = serial - days;
  const date = new Date(epoch.getTime() + days * 86400000);
  if (fraction > 0) {
    const totalMs = Math.round(fraction * 86400000);
    date.setMilliseconds(date.getMilliseconds() + totalMs);
  }
  return date;
}

function formatDateValue(value: string | number | boolean | null, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseDateFromValue(value);
  if (!date) return String(value ?? '');
  return date.toLocaleDateString(locale, options);
}

function formatTimeValue(value: string | number | boolean | null, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseDateFromValue(value);
  if (!date) return String(value ?? '');
  return date.toLocaleTimeString(locale, options);
}

function formatDateTimeValue(value: string | number | boolean | null): string {
  const date = parseDateFromValue(value);
  if (!date) return String(value ?? '');
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function toFraction(num: number): string {
  if (Number.isInteger(num)) return String(num);
  const wholeNum = Math.trunc(num);
  const decimal = Math.abs(num - wholeNum);

  if (decimal === 0) return String(wholeNum);

  // Find best fraction approximation with denominator up to 64
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Infinity;

  for (let denom = 1; denom <= 64; denom++) {
    const numer = Math.round(decimal * denom);
    const error = Math.abs(decimal - numer / denom);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numer;
      bestDenominator = denom;
      if (error < 0.0001) break;
    }
  }

  if (bestNumerator === 0) return String(wholeNum || 0);
  if (bestNumerator === bestDenominator) return String(wholeNum + (num >= 0 ? 1 : -1));

  const sign = num < 0 ? '-' : '';
  if (wholeNum === 0) {
    return `${sign}${bestNumerator}/${bestDenominator}`;
  }
  return `${sign}${Math.abs(wholeNum)} ${bestNumerator}/${bestDenominator}`;
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
