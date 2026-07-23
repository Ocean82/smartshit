/**
 * Lightweight date manipulation utility for budget projections and date arithmetic.
 *
 * Adapted from Univer's core/shared/date-kit.ts (Apache-2.0).
 * Provides: parse, format, add/subtract, startOf/endOf, diff, week numbers.
 * Zero dependencies. Single file.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DateUnit = 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'

export interface DateKitResult {
  /** Whether the parsed date is valid. */
  valid: boolean
  /** The underlying Date object. */
  date: Date
  /** Format the date using template tokens (YYYY, MM, DD, etc.). */
  format: (template?: string) => string
  /** Add time to the date. */
  add: (value: number, unit?: DateUnit) => DateKitResult
  /** Subtract time from the date. */
  subtract: (value: number, unit?: DateUnit) => DateKitResult
  /** Get the start of a time period. */
  startOf: (unit: DateUnit) => DateKitResult
  /** Get the end of a time period. */
  endOf: (unit: DateUnit) => DateKitResult
  /** Difference between this date and another, in the given unit. */
  diff: (other: DateKitResult | Date | string | number, unit?: DateUnit) => number
  /** Get the ISO week number (1-53). */
  week: () => number
  /** Get the day of week (0=Sunday, 6=Saturday). */
  weekday: () => number
  /** Unix timestamp in milliseconds. */
  valueOf: () => number
  /** Unix timestamp in seconds. */
  unix: () => number
  /** Whether this date is before another. */
  isBefore: (other: DateKitResult | Date | string | number) => boolean
  /** Whether this date is after another. */
  isAfter: (other: DateKitResult | Date | string | number) => boolean
  /** Whether this date is the same day as another. */
  isSame: (other: DateKitResult | Date | string | number, unit?: DateUnit) => boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Create a date-kit wrapper from various input types.
 */
export function dateKit(input?: Date | string | number | null): DateKitResult {
  const d = parseInput(input)
  return wrap(d)
}

/** Create from a Unix timestamp (seconds). */
dateKit.unix = (timestamp: number): DateKitResult => wrap(new Date(timestamp * 1000))

/** Get current date-time. */
dateKit.now = (): DateKitResult => wrap(new Date())

// ─── Implementation ─────────────────────────────────────────────────────────

function wrap(d: Date): DateKitResult {
  const valid = !isNaN(d.getTime())

  const result: DateKitResult = {
    valid,
    date: d,
    valueOf: () => d.getTime(),
    unix: () => Math.floor(d.getTime() / 1000),

    format: (template = 'YYYY-MM-DD') => {
      if (!valid) return 'Invalid Date'
      return formatDate(d, template)
    },

    add: (value, unit = 'day') => wrap(addToDate(d, value, unit)),
    subtract: (value, unit = 'day') => wrap(addToDate(d, -value, unit)),

    startOf: (unit) => wrap(startOfDate(d, unit)),
    endOf: (unit) => {
      const start = startOfDate(d, unit)
      const next = addToDate(start, 1, unit)
      return wrap(new Date(next.getTime() - 1))
    },

    diff: (other, unit = 'day') => {
      const otherDate = resolveDate(other)
      const ms = d.getTime() - otherDate.getTime()
      switch (unit) {
        case 'second': return Math.floor(ms / 1000)
        case 'minute': return Math.floor(ms / 60000)
        case 'hour': return Math.floor(ms / 3600000)
        case 'day': return Math.floor(ms / 86400000)
        case 'week': return Math.floor(ms / 604800000)
        case 'month': return monthDiff(d, otherDate)
        case 'year': return Math.floor(monthDiff(d, otherDate) / 12)
        default: return Math.floor(ms / 86400000)
      }
    },

    week: () => getWeekNumber(d),
    weekday: () => d.getDay(),

    isBefore: (other) => d.getTime() < resolveDate(other).getTime(),
    isAfter: (other) => d.getTime() > resolveDate(other).getTime(),
    isSame: (other, unit = 'day') => {
      const a = startOfDate(d, unit)
      const b = startOfDate(resolveDate(other), unit)
      return a.getTime() === b.getTime()
    },
  }

  return result
}

function parseInput(input?: Date | string | number | null): Date {
  if (input == null) return new Date()
  if (input instanceof Date) return new Date(input.getTime())
  if (typeof input === 'number') {
    // Excel serial date detection
    if (input >= 1 && input <= 2958465) {
      return excelSerialToDate(input)
    }
    return new Date(input)
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return new Date(NaN)
    // ISO: 2026-07-11 or 2026-07-11T15:45:30
    const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(trimmed)
    if (iso) {
      return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0))
    }
    // US: 7/11/2026
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
    if (us) return new Date(+us[3], +us[1] - 1, +us[2])
    // Fallback
    const parsed = Date.parse(trimmed)
    return isNaN(parsed) ? new Date(NaN) : new Date(parsed)
  }
  return new Date(NaN)
}

function resolveDate(input: DateKitResult | Date | string | number): Date {
  if (input && typeof input === 'object' && 'date' in input) return input.date
  return parseInput(input as Date | string | number)
}

function excelSerialToDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30)
  const days = Math.floor(serial)
  const fraction = serial - days
  const date = new Date(epoch.getTime() + days * 86400000)
  if (fraction > 0) {
    date.setMilliseconds(date.getMilliseconds() + Math.round(fraction * 86400000))
  }
  return date
}

function addToDate(d: Date, value: number, unit: DateUnit): Date {
  const result = new Date(d.getTime())
  switch (unit) {
    case 'second': result.setSeconds(result.getSeconds() + value); break
    case 'minute': result.setMinutes(result.getMinutes() + value); break
    case 'hour': result.setHours(result.getHours() + value); break
    case 'day': result.setDate(result.getDate() + value); break
    case 'week': result.setDate(result.getDate() + value * 7); break
    case 'month': {
      const targetMonth = result.getMonth() + value
      const dayOfMonth = result.getDate()
      result.setDate(1)
      result.setMonth(targetMonth)
      const daysInTarget = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
      result.setDate(Math.min(dayOfMonth, daysInTarget))
      break
    }
    case 'year': {
      const dayOfMonth = result.getDate()
      result.setDate(1)
      result.setFullYear(result.getFullYear() + value)
      const daysInTarget = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
      result.setDate(Math.min(dayOfMonth, daysInTarget))
      break
    }
  }
  return result
}

function startOfDate(d: Date, unit: DateUnit): Date {
  switch (unit) {
    case 'second': return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
    case 'minute': return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
    case 'hour': return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
    case 'day': return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    case 'week': {
      const day = d.getDay()
      const diff = d.getDate() - day
      return new Date(d.getFullYear(), d.getMonth(), diff)
    }
    case 'month': return new Date(d.getFullYear(), d.getMonth(), 1)
    case 'year': return new Date(d.getFullYear(), 0, 1)
  }
}

function monthDiff(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())
}

function getWeekNumber(d: Date): number {
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1
  return Math.ceil(dayOfYear / 7)
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function formatDate(d: Date, template: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: pad(d.getFullYear() % 100),
    MMMM: MONTH_NAMES[d.getMonth()],
    MMM: MONTH_SHORT[d.getMonth()],
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    dddd: DAY_NAMES[d.getDay()],
    ddd: DAY_SHORT[d.getDay()],
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    hh: pad(d.getHours() % 12 || 12),
    h: String(d.getHours() % 12 || 12),
    mm: pad(d.getMinutes()),
    m: String(d.getMinutes()),
    ss: pad(d.getSeconds()),
    s: String(d.getSeconds()),
    A: d.getHours() >= 12 ? 'PM' : 'AM',
    a: d.getHours() >= 12 ? 'pm' : 'am',
  }

  return template.replace(
    /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g,
    (token) => tokens[token] ?? token,
  )
}
