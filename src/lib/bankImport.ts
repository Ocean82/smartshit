/**
 * Bank CSV Import Intelligence
 *
 * Detects bank-specific CSV formats (Chase, Wells Fargo, Capital One, Bank of America,
 * Citi, generic), normalizes transactions, and auto-categorizes them based on
 * merchant name pattern matching.
 *
 * This is the "aha moment" — user drags in a bank CSV, gets an auto-categorized
 * budget breakdown in seconds.
 */

export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  type: 'debit' | 'credit'
  originalRow: number
}

export interface BankImportResult {
  bankName: string
  transactions: Transaction[]
  dateRange: { start: string; end: string }
  totalIncome: number
  totalExpenses: number
  categoryBreakdown: Array<{ category: string; total: number; count: number }>
  warnings: string[]
}

// ─── Bank Format Detection ───────────────────────────────────────────────────

interface BankFormat {
  name: string
  /** Check if headers match this bank's format */
  detect: (headers: string[]) => boolean
  /** Parse a row into a transaction */
  parse: (row: string[], headers: string[]) => { date: string; description: string; amount: number } | null
}

const BANK_FORMATS: BankFormat[] = [
  {
    name: 'Chase',
    detect: (h) => h.includes('Transaction Date') && h.includes('Post Date') && h.includes('Description') && h.includes('Amount'),
    parse: (row, headers) => {
      const dateIdx = headers.indexOf('Transaction Date')
      const descIdx = headers.indexOf('Description')
      const amountIdx = headers.indexOf('Amount')
      if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) return null
      const amount = parseFloat(row[amountIdx]?.replace(/[$,]/g, '') ?? '')
      if (isNaN(amount)) return null
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
  {
    name: 'Wells Fargo',
    detect: (h) => h.includes('Date') && h.includes('Amount') && h.includes('Description') && !h.includes('Transaction Date'),
    parse: (row, headers) => {
      const dateIdx = headers.indexOf('Date')
      const descIdx = headers.indexOf('Description')
      const amountIdx = headers.indexOf('Amount')
      if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) return null
      const amount = parseFloat(row[amountIdx]?.replace(/[$,]/g, '') ?? '')
      if (isNaN(amount)) return null
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
  {
    name: 'Capital One',
    detect: (h) => h.includes('Transaction Date') && h.includes('Posted Date') && h.includes('Card No.') && h.includes('Debit') && h.includes('Credit'),
    parse: (row, headers) => {
      const dateIdx = headers.indexOf('Transaction Date')
      const descIdx = headers.indexOf('Description')
      const debitIdx = headers.indexOf('Debit')
      const creditIdx = headers.indexOf('Credit')
      if (dateIdx < 0 || descIdx < 0) return null
      const debit = parseFloat(row[debitIdx]?.replace(/[$,]/g, '') ?? '') || 0
      const credit = parseFloat(row[creditIdx]?.replace(/[$,]/g, '') ?? '') || 0
      const amount = credit > 0 ? credit : -debit
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
  {
    name: 'Bank of America',
    detect: (h) => h.includes('Date') && h.includes('Description') && h.includes('Amount') && h.includes('Running Bal.'),
    parse: (row, headers) => {
      const dateIdx = headers.indexOf('Date')
      const descIdx = headers.indexOf('Description')
      const amountIdx = headers.indexOf('Amount')
      if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) return null
      const amount = parseFloat(row[amountIdx]?.replace(/[$,]/g, '') ?? '')
      if (isNaN(amount)) return null
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
  {
    name: 'Citi',
    detect: (h) => h.includes('Status') && h.includes('Date') && h.includes('Description') && h.includes('Debit') && h.includes('Credit'),
    parse: (row, headers) => {
      const dateIdx = headers.indexOf('Date')
      const descIdx = headers.indexOf('Description')
      const debitIdx = headers.indexOf('Debit')
      const creditIdx = headers.indexOf('Credit')
      if (dateIdx < 0 || descIdx < 0) return null
      const debit = parseFloat(row[debitIdx]?.replace(/[$,]/g, '') ?? '') || 0
      const credit = parseFloat(row[creditIdx]?.replace(/[$,]/g, '') ?? '') || 0
      const amount = credit > 0 ? credit : -debit
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
  {
    // Generic fallback: any CSV with Date + Description/Memo + Amount columns
    name: 'Generic Bank',
    detect: (h) => {
      const hasDate = h.some((c) => /date/i.test(c))
      const hasDesc = h.some((c) => /desc|memo|payee|merchant|narrative/i.test(c))
      const hasAmount = h.some((c) => /amount|debit|credit|sum|value/i.test(c))
      return hasDate && hasDesc && hasAmount
    },
    parse: (row, headers) => {
      const dateIdx = headers.findIndex((c) => /date/i.test(c))
      const descIdx = headers.findIndex((c) => /desc|memo|payee|merchant|narrative/i.test(c))
      const amountIdx = headers.findIndex((c) => /^amount$/i.test(c))
      const debitIdx = headers.findIndex((c) => /debit/i.test(c))
      const creditIdx = headers.findIndex((c) => /credit/i.test(c))

      if (dateIdx < 0 || descIdx < 0) return null

      let amount: number
      if (amountIdx >= 0) {
        amount = parseFloat(row[amountIdx]?.replace(/[$,]/g, '') ?? '')
      } else if (debitIdx >= 0 || creditIdx >= 0) {
        const debit = debitIdx >= 0 ? (parseFloat(row[debitIdx]?.replace(/[$,]/g, '') ?? '') || 0) : 0
        const credit = creditIdx >= 0 ? (parseFloat(row[creditIdx]?.replace(/[$,]/g, '') ?? '') || 0) : 0
        amount = credit > 0 ? credit : -debit
      } else {
        return null
      }

      if (isNaN(amount)) return null
      return { date: row[dateIdx] ?? '', description: row[descIdx] ?? '', amount }
    },
  },
]

// ─── Transaction Categorization ──────────────────────────────────────────────

interface CategoryRule {
  category: string
  patterns: RegExp[]
}

const CATEGORY_RULES: CategoryRule[] = [
  { category: 'Housing', patterns: [/rent/i, /mortgage/i, /hoa/i, /property tax/i, /apartment/i, /landlord/i] },
  { category: 'Utilities', patterns: [/electric/i, /gas bill/i, /water bill/i, /internet/i, /comcast/i, /spectrum/i, /at&t/i, /verizon/i, /t-mobile/i, /xfinity/i, /utility/i, /power/i, /sewer/i] },
  { category: 'Groceries', patterns: [/walmart/i, /kroger/i, /safeway/i, /whole foods/i, /trader joe/i, /costco/i, /aldi/i, /publix/i, /wegman/i, /h-e-b/i, /target.*groc/i, /grocery/i, /supermarket/i, /food.*lion/i, /sprouts/i] },
  { category: 'Dining', patterns: [/mcdonald/i, /starbucks/i, /chipotle/i, /doordash/i, /uber.*eat/i, /grubhub/i, /restaurant/i, /pizza/i, /subway/i, /wendy/i, /taco bell/i, /panera/i, /chick-fil/i, /dunkin/i, /diner/i, /cafe/i, /coffee/i] },
  { category: 'Transportation', patterns: [/uber/i, /lyft/i, /gas station/i, /shell/i, /chevron/i, /exxon/i, /bp /i, /parking/i, /toll/i, /transit/i, /metro/i, /bus /i, /fuel/i] },
  { category: 'Insurance', patterns: [/geico/i, /state farm/i, /allstate/i, /progressive/i, /insurance/i, /premium/i, /mutual/i] },
  { category: 'Healthcare', patterns: [/pharmacy/i, /cvs/i, /walgreen/i, /doctor/i, /hospital/i, /medical/i, /dental/i, /health/i, /rx /i, /copay/i, /urgent care/i, /lab /i] },
  { category: 'Entertainment', patterns: [/netflix/i, /spotify/i, /hulu/i, /disney\+/i, /hbo/i, /apple.*tv/i, /youtube.*prem/i, /amazon.*prime/i, /movie/i, /cinema/i, /theater/i, /gaming/i, /xbox/i, /playstation/i, /steam/i, /twitch/i] },
  { category: 'Shopping', patterns: [/amazon/i, /target/i, /best buy/i, /walmart/i, /ebay/i, /etsy/i, /nike/i, /nordstrom/i, /macy/i, /home depot/i, /lowes/i, /ikea/i, /clothing/i, /apparel/i] },
  { category: 'Subscriptions', patterns: [/subscription/i, /membership/i, /monthly fee/i, /annual fee/i, /recurring/i, /gym/i, /fitness/i, /planet fitness/i, /equinox/i, /adobe/i, /microsoft 365/i, /icloud/i, /dropbox/i] },
  { category: 'Education', patterns: [/tuition/i, /university/i, /college/i, /school/i, /student loan/i, /navient/i, /sallie mae/i, /book/i, /course/i, /udemy/i, /coursera/i] },
  { category: 'Personal Care', patterns: [/salon/i, /barber/i, /spa/i, /haircut/i, /beauty/i, /nails/i, /massage/i] },
  { category: 'Pets', patterns: [/vet/i, /pet/i, /petsmart/i, /petco/i, /animal/i, /chewy/i] },
  { category: 'Savings/Transfer', patterns: [/transfer/i, /savings/i, /zelle/i, /venmo/i, /paypal/i, /cash app/i, /direct deposit/i, /wire/i] },
  { category: 'Income', patterns: [/payroll/i, /direct dep/i, /salary/i, /wage/i, /refund/i, /deposit/i, /interest.*earned/i, /dividend/i] },
]

function categorizeTransaction(description: string, amount: number): string {
  const desc = description.trim()

  // Positive amounts are typically income/credits
  if (amount > 0) {
    // Check if it matches a specific spending category anyway (refunds)
    for (const rule of CATEGORY_RULES) {
      if (rule.category === 'Income') continue
      if (rule.patterns.some((p) => p.test(desc))) {
        return rule.category + ' (Refund)'
      }
    }
    return 'Income'
  }

  // Negative amounts: match against category rules
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(desc))) {
      return rule.category
    }
  }

  return 'Other'
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

function normalizeDate(dateStr: string): string {
  const s = dateStr.trim()
  // Try MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // Try YYYY-MM-DD (already normalized)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Try MM-DD-YYYY
  const mdy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdy2) return `${mdy2[3]}-${mdy2[1].padStart(2, '0')}-${mdy2[2].padStart(2, '0')}`
  return s
}

// ─── Main Import Function ────────────────────────────────────────────────────

export function parseBankCSV(csvText: string): BankImportResult | null {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null

  const headers = parseCSVLine(lines[0])
  const warnings: string[] = []

  // Detect bank format
  const format = BANK_FORMATS.find((f) => f.detect(headers))
  if (!format) return null

  const bankName = format.name

  // Parse transactions
  const transactions: Transaction[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i])
    if (row.length < 2) continue

    const parsed = format.parse(row, headers)
    if (!parsed) continue
    if (parsed.amount === 0) continue

    const category = categorizeTransaction(parsed.description, parsed.amount)
    const normalizedDate = normalizeDate(parsed.date)

    transactions.push({
      date: normalizedDate,
      description: parsed.description,
      amount: Math.abs(parsed.amount),
      category,
      type: parsed.amount >= 0 ? 'credit' : 'debit',
      originalRow: i,
    })
  }

  if (transactions.length === 0) {
    warnings.push('No valid transactions found in the file.')
    return null
  }

  // Calculate stats
  const totalIncome = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0)

  // Category breakdown (expenses only)
  const catMap = new Map<string, { total: number; count: number }>()
  for (const t of transactions.filter((t) => t.type === 'debit')) {
    const existing = catMap.get(t.category) ?? { total: 0, count: 0 }
    existing.total += t.amount
    existing.count++
    catMap.set(t.category, existing)
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, { total, count }]) => ({ category, total: Math.round(total * 100) / 100, count }))
    .sort((a, b) => b.total - a.total)

  // Date range
  const dates = transactions.map((t) => t.date).filter((d) => d.length > 0).sort()
  const dateRange = {
    start: dates[0] ?? '',
    end: dates[dates.length - 1] ?? '',
  }

  if (transactions.length < lines.length - 1) {
    warnings.push(`${lines.length - 1 - transactions.length} rows could not be parsed.`)
  }

  return {
    bankName,
    transactions,
    dateRange,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    categoryBreakdown,
    warnings,
  }
}

/**
 * Detect if a CSV file looks like a bank statement (vs generic data).
 * Uses header heuristics — if it has date + description + amount-like columns,
 * it's likely a bank export.
 */
export function isBankCSV(csvText: string): boolean {
  const firstLine = csvText.split(/\r?\n/)[0] ?? ''
  const headers = parseCSVLine(firstLine)
  return BANK_FORMATS.some((f) => f.detect(headers))
}
