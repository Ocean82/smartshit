/**
 * Intent reference phrases — single source of truth.
 *
 * These phrases are embedded via MiniLM to build the reference vectors used
 * for semantic intent classification. Two consumers read this file:
 *
 *   1. src/ai/nlp/intentEmbeddings.ts  — runtime client classification.
 *   2. scripts/precompute-embeddings.mjs — builds public/models/minilm/intent-vectors.bin.
 *
 * Keeping the list here (plain ESM, no TS/path-alias deps) lets the Node
 * precompute script and the bundled client import the exact same data, so the
 * precomputed vectors can never silently drift from the runtime phrase set.
 *
 * IMPORTANT: When you edit these phrases, the precomputed intent-vectors.bin
 * becomes stale. Regeneration is automatic — deploy.sh hashes this phrase set
 * (INTENT_PHRASES_HASH) and re-runs model:precompute when the hash changes, and
 * the client rejects a binary whose embedded hash no longer matches.
 */

/** @type {Record<string, string[]>} */
export const INTENT_PHRASES = {
  read: [
    'show me the data in column B',
    'display the values in this range',
    'what does cell A1 contain',
    'let me see the contents of this sheet',
    'open the expenses sheet',
  ],
  analyze: [
    'analyze the spending trends over time',
    'examine the data for patterns',
    'what insights can you find in this data',
    'investigate the revenue numbers',
    'assess the financial performance',
  ],
  write: [
    'enter the value 500 in cell B3',
    'update the name in row 5',
    'change the price to 29.99',
    'put the total in the last row',
    'edit the description field',
  ],
  format: [
    'make the header row bold',
    'change the font color to red',
    'apply currency formatting to column C',
    'highlight the cells with values over 1000',
    'align the text to center',
  ],
  create_chart: [
    'create a bar chart from column A and B',
    'make a pie chart showing expenses by category',
    'visualize the monthly revenue as a line graph',
    'plot the data as a chart',
    'show me a graph of sales over time',
  ],
  create_formula: [
    'add a SUM formula for the total',
    'write a VLOOKUP to find the price',
    'create a formula to calculate the average',
    'insert a COUNTIF for values greater than 100',
    'build an IF formula for the status column',
  ],
  summarize: [
    'give me a summary of the spreadsheet',
    'provide an overview of the expenses',
    'summarize the key findings from this data',
    'what are the main takeaways',
    'condense this data into highlights',
  ],
  filter: [
    'filter rows where amount is greater than 500',
    'show only the entries from January',
    'hide rows with empty values',
    'narrow down to just marketing expenses',
    'only show completed items',
  ],
  sort: [
    'sort the data by date in descending order',
    'arrange rows alphabetically by name',
    'order the expenses from highest to lowest',
    'rank the items by their score',
    'organize by category then by amount',
  ],
  clean: [
    'remove all duplicate rows',
    'clean up the empty cells',
    'delete rows with missing data',
    'trim the whitespace from all cells',
    'deduplicate the email column',
  ],
  budget: [
    'help me set up a monthly budget',
    'track my expenses for this month',
    'show my income vs spending',
    'create a budget plan for the quarter',
    'how much did I spend on groceries',
  ],
  report: [
    'generate a monthly expense report',
    'create a report of all transactions',
    'compile the sales data into a document',
    'produce a summary report for the team',
    'build a quarterly financial report',
  ],
  compare: [
    'compare this month to last month',
    'what is the difference between Q1 and Q2',
    'show the changes between these two columns',
    'contrast the budget vs actual spending',
    'how do these numbers stack up side by side',
  ],
  find: [
    'find all cells containing the word error',
    'search for duplicate entries',
    'locate the highest value in column D',
    'where is the entry for John Smith',
    'identify all negative numbers',
  ],
  calculate: [
    'calculate the total for this column',
    'what is the average of these values',
    'compute the sum of row 3',
    'add up all the expenses',
    'multiply column A by column B',
  ],
  export: [
    'export this sheet as a CSV file',
    'download the data as PDF',
    'save this as an Excel file',
    'convert the report to PDF format',
    'output the results to a spreadsheet',
  ],
  chat: [
    'hello how are you',
    'what can you help me with',
    'explain how formulas work',
    'tell me about this spreadsheet app',
    'I have a question about my data',
  ],
  unknown: [],
}

/**
 * Deterministic 32-bit FNV-1a hash of the intent phrase set. Both the
 * precompute script and the client embed this in / validate it against
 * intent-vectors.bin so a phrase change forces regeneration and rejects a
 * stale binary. Order-sensitive (intents are serialized in declaration order).
 *
 * @param {Record<string, string[]>} [phrases]
 * @returns {number} unsigned 32-bit hash
 */
export function intentPhrasesHash(phrases = INTENT_PHRASES) {
  // Serialize as "intent\x1fphrase\x1fphrase\x1e..." — control chars can't
  // appear in the phrases, so the encoding is unambiguous.
  let serialized = ''
  for (const [intent, list] of Object.entries(phrases)) {
    serialized += intent + '\x1f' + list.join('\x1f') + '\x1e'
  }
  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    // FNV prime 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
