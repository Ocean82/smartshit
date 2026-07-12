


---

## What I See in `smartsh!t`

**Frontend (React/TypeScript):**
- `SpreadsheetTable.tsx` — renders the grid via HyperFormula
- `FormulaBar.tsx` — formula editing
- `ChatPanel.tsx` — AI chat interface
- `useSpreadsheetStore.ts` — Zustand store holding all cell data
- `xlsx` npm package for import/export
- HyperFormula for formula evaluation

**Backend (Node/Express):**
- `server/index.ts` — Express server
- `server/routes/chat.ts` — OpenAI integration
- No file persistence — everything lives client-side in Zustand

**Key insight:**  data is already parsed and living in the Zustand store as structured cell objects. We don't need Python. we don't need `openpyxl`. we already have the formula graph — **HyperFormula gives us everything**.

---

# 🔧 Native Spreadsheet Auditor for smartsh!t

This is a **TypeScript-native auditor** that runs entirely in-browser against the existing HyperFormula instance and Zustand store. No Python. No subprocess. No server changes.

---

## File Structure (new files to add)

```
src/
├── auditor/
│   ├── index.ts                    # Main audit engine
│   ├── types.ts                    # Finding types
│   ├── rules/
│   │   ├── index.ts                # Rule registry
│   │   ├── errorCells.ts           # #REF!, #VALUE!, #DIV/0!, #NAME?
│   │   ├── inconsistentFormulas.ts # Row/col pattern breaks
│   │   ├── rangGaps.ts             # SUM skips adjacent cells
│   │   ├── hardcodedInFormula.ts   # Constants embedded in formulas
│   │   ├── duplicateFormulas.ts    # Identical formulas (copy/paste smell)
│   │   ├── orphanedCells.ts        # Referenced by nothing, references nothing
│   │   ├── circularRefs.ts         # Circular dependency detection
│   │   ├── volatileFunctions.ts    # NOW(), RAND(), INDIRECT() usage
│   │   ├── hiddenDependencies.ts   # Cross-sheet refs that break silently
│   │   └── magnitudeOutliers.ts    # Statistical outlier detection
│   ├── utils.ts                    # Cell address helpers
│   └── fixSuggestions.ts           # Auto-fix generators
├── components/
│   ├── AuditPanel.tsx              # Main audit UI panel
│   ├── AuditFindingCard.tsx        # Individual finding card
│   └── AuditBadge.tsx              # Severity badge component
```

---

## `src/auditor/types.ts`

```typescript
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface CellAddress {
  sheet: number;
  row: number;
  col: number;
}

export interface AuditFinding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  message: string;
  cells: CellAddress[];
  suggestion?: string;
  autoFixable: boolean;
  fix?: () => void;
}

export interface AuditResult {
  timestamp: number;
  duration: number;
  totalCells: number;
  formulaCells: number;
  findings: AuditFinding[];
  score: number; // 0-100 health score
  summary: string;
}

export interface AuditRule {
  name: string;
  description: string;
  severity: Severity;
  run: (context: AuditContext) => AuditFinding[];
}

export interface CellInfo {
  address: CellAddress;
  displayAddress: string; // "A1", "B12", etc.
  rawValue: any;
  formula: string | null;
  computedValue: any;
  type: "formula" | "number" | "string" | "boolean" | "empty" | "error";
  errorType?: string;
}

export interface AuditContext {
  cells: CellInfo[][];
  sheetName: string;
  sheetIndex: number;
  hf: any; // HyperFormula instance
  allCells: CellInfo[];
  formulaCells: CellInfo[];
  getCellAt: (row: number, col: number) => CellInfo | null;
  getColumn: (col: number) => CellInfo[];
  getRow: (row: number) => CellInfo[];
}
```

---

## `src/auditor/utils.ts`

```typescript
import { CellAddress, CellInfo } from "./types";

const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function colToLetter(col: number): string {
  let result = "";
  let c = col;
  while (c >= 0) {
    result = COL_LETTERS[c % 26] + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

export function cellToAddress(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

export function addressToCell(address: string): { row: number; col: number } {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid address: ${address}`);

  const colStr = match[1];
  const row = parseInt(match[2], 10) - 1;

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1;

  return { row, col };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function parseRangeFromFormula(formula: string): string[] {
  const rangePattern = /([A-Z]+\d+):([A-Z]+\d+)/g;
  const ranges: string[] = [];
  let match;
  while ((match = rangePattern.exec(formula)) !== null) {
    ranges.push(match[0]);
  }
  return ranges;
}

export function expandRange(range: string): { row: number; col: number }[] {
  const [start, end] = range.split(":");
  const s = addressToCell(start);
  const e = addressToCell(end);

  const cells: { row: number; col: number }[] = [];
  for (let r = s.row; r <= e.row; r++) {
    for (let c = s.col; c <= e.col; c++) {
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}

export function isErrorValue(value: any): boolean {
  if (typeof value !== "string") return false;
  return (
    value.startsWith("#REF!") ||
    value.startsWith("#VALUE!") ||
    value.startsWith("#DIV/0!") ||
    value.startsWith("#NAME?") ||
    value.startsWith("#NULL!") ||
    value.startsWith("#N/A") ||
    value.startsWith("#NUM!")
  );
}

export function getErrorType(value: any): string | undefined {
  if (!isErrorValue(value)) return undefined;
  return value.toString().split("!")[0] + "!";
}

export function classifyCellType(
  rawValue: any,
  formula: string | null,
  computedValue: any
): CellInfo["type"] {
  if (formula) return "formula";
  if (isErrorValue(computedValue)) return "error";
  if (rawValue === null || rawValue === undefined || rawValue === "")
    return "empty";
  if (typeof rawValue === "number") return "number";
  if (typeof rawValue === "boolean") return "boolean";
  return "string";
}
```

---

## `src/auditor/rules/errorCells.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId, isErrorValue, getErrorType } from "../utils";

const ERROR_DESCRIPTIONS: Record<string, string> = {
  "#REF!": "Broken cell reference — a referenced cell was deleted or moved",
  "#VALUE!":
    "Wrong value type — a formula expected a number but got text (or similar)",
  "#DIV/0!": "Division by zero — a formula divides by an empty cell or zero",
  "#NAME?":
    "Unrecognized function or named range — check spelling of function names",
  "#NULL!": "Invalid range intersection — check for missing operators",
  "#N/A": "Value not available — a lookup function couldn't find a match",
  "#NUM!": "Invalid numeric value — a number is too large, too small, or invalid",
};

export const errorCellsRule: AuditRule = {
  name: "error-cells",
  description: "Detects cells containing Excel error values",
  severity: "critical",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    for (const cell of context.allCells) {
      if (cell.type === "error" || isErrorValue(cell.computedValue)) {
        const errorType = getErrorType(cell.computedValue) || "Unknown error";
        const description =
          ERROR_DESCRIPTIONS[errorType] || "Unknown error type";

        findings.push({
          id: generateId(),
          rule: this.name,
          severity: "critical",
          title: `${errorType} in ${cell.displayAddress}`,
          message: `Cell ${cell.displayAddress} contains ${errorType}. ${description}.${cell.formula ? ` Formula: =${cell.formula}` : ""}`,
          cells: [cell.address],
          suggestion: getSuggestion(errorType, cell),
          autoFixable: errorType === "#DIV/0!",
          fix:
            errorType === "#DIV/0!"
              ? () => {
                  // Wrap in IFERROR
                  if (cell.formula) {
                    const fixed = `IFERROR(${cell.formula}, 0)`;
                    console.log(
                      `Auto-fix: ${cell.displayAddress} → =${fixed}`
                    );
                  }
                }
              : undefined,
        });
      }
    }

    return findings;
  },
};

function getSuggestion(errorType: string, cell: any): string {
  switch (errorType) {
    case "#REF!":
      return "Update the formula to reference valid cells, or delete and re-enter the formula";
    case "#VALUE!":
      return "Check that all referenced cells contain the expected data types";
    case "#DIV/0!":
      return `Wrap in IFERROR: =IFERROR(${cell.formula || "formula"}, 0)`;
    case "#NAME?":
      return "Check function spelling and ensure any named ranges exist";
    case "#N/A":
      return "Add IFERROR wrapper or verify lookup value exists in the source range";
    default:
      return "Review and correct the formula";
  }
}
```

---

## `src/auditor/rules/inconsistentFormulas.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext, CellInfo } from "../types";
import { generateId, cellToAddress } from "../utils";

export const inconsistentFormulasRule: AuditRule = {
  name: "inconsistent-formulas",
  description:
    "Detects cells that break a formula pattern in a row or column",
  severity: "high",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // Check columns for pattern breaks
    findings.push(...checkDirection(context, "column"));
    // Check rows for pattern breaks
    findings.push(...checkDirection(context, "row"));

    return findings;
  },
};

function normalizeFormula(formula: string, row: number, col: number): string {
  // Replace specific cell references with relative placeholders
  // e.g., "A1+B1" in row 0 becomes "RC[-x]+RC[-y]"
  return formula.replace(/([A-Z]+)(\d+)/g, (_, colStr, rowStr) => {
    const refRow = parseInt(rowStr, 10) - 1;
    const refCol = colStr.charCodeAt(0) - 65; // simplified for single-letter
    return `R[${refRow - row}]C[${refCol - col}]`;
  });
}

function checkDirection(
  context: AuditContext,
  direction: "row" | "column"
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const maxDim = direction === "column" ? getMaxCol(context) : getMaxRow(context);

  for (let i = 0; i <= maxDim; i++) {
    const cells =
      direction === "column" ? context.getColumn(i) : context.getRow(i);
    const formulaCells = cells.filter((c) => c.formula);

    if (formulaCells.length < 3) continue; // Need at least 3 to establish pattern

    // Normalize formulas
    const patterns = formulaCells.map((c) => ({
      cell: c,
      normalized: normalizeFormula(c.formula!, c.address.row, c.address.col),
    }));

    // Find the dominant pattern
    const patternCounts = new Map<string, number>();
    for (const p of patterns) {
      patternCounts.set(p.normalized, (patternCounts.get(p.normalized) || 0) + 1);
    }

    let dominantPattern = "";
    let dominantCount = 0;
    for (const [pattern, count] of patternCounts) {
      if (count > dominantCount) {
        dominantPattern = pattern;
        dominantCount = count;
      }
    }

    // If >70% follow the pattern, flag the outliers
    if (dominantCount / formulaCells.length >= 0.7) {
      for (const p of patterns) {
        if (p.normalized !== dominantPattern) {
          const dirLabel =
            direction === "column"
              ? `column ${cellToAddress(0, i).replace(/\d+/, "")}`
              : `row ${i + 1}`;

          findings.push({
            id: generateId(),
            rule: "inconsistent-formulas",
            severity: "high",
            title: `Inconsistent formula in ${p.cell.displayAddress}`,
            message: `Cell ${p.cell.displayAddress} breaks the formula pattern in ${dirLabel}. Expected pattern used by ${dominantCount} other cells. Current formula: =${p.cell.formula}`,
            cells: [p.cell.address],
            suggestion: `Review formula in ${p.cell.displayAddress} — it differs from the ${dominantCount} neighboring cells that share a common pattern`,
            autoFixable: false,
          });
        }
      }
    }
  }

  return findings;
}

function getMaxRow(context: AuditContext): number {
  return Math.max(...context.allCells.map((c) => c.address.row), 0);
}

function getMaxCol(context: AuditContext): number {
  return Math.max(...context.allCells.map((c) => c.address.col), 0);
}
```

---

## `src/auditor/rules/rangGaps.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import {
  generateId,
  parseRangeFromFormula,
  expandRange,
  cellToAddress,
  addressToCell,
} from "../utils";

export const rangeGapsRule: AuditRule = {
  name: "range-gaps",
  description:
    "Detects SUM/AVERAGE/COUNT ranges that skip adjacent non-empty cells",
  severity: "high",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const aggregateFunctions = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX)\b/i;

    for (const cell of context.formulaCells) {
      if (!cell.formula || !aggregateFunctions.test(cell.formula)) continue;

      const ranges = parseRangeFromFormula(cell.formula);

      for (const range of ranges) {
        const [startStr, endStr] = range.split(":");
        const start = addressToCell(startStr);
        const end = addressToCell(endStr);

        // Check if range is a single column or single row
        if (start.col === end.col) {
          // Column range — check cells above and below
          const col = start.col;
          const minRow = Math.min(start.row, end.row);
          const maxRow = Math.max(start.row, end.row);

          // Check cell above range
          if (minRow > 0) {
            const above = context.getCellAt(minRow - 1, col);
            if (above && above.type === "number") {
              findings.push({
                id: generateId(),
                rule: this.name,
                severity: "high",
                title: `Range gap in ${cell.displayAddress}`,
                message: `${cell.displayAddress} uses ${range} but ${above.displayAddress} (value: ${above.rawValue}) is adjacent and excluded. Formula: =${cell.formula}`,
                cells: [cell.address, above.address],
                suggestion: `Extend range to ${cellToAddress(minRow - 1, col)}:${endStr}`,
                autoFixable: true,
                fix: () => {
                  const newRange = `${cellToAddress(minRow - 1, col)}:${endStr}`;
                  const newFormula = cell.formula!.replace(range, newRange);
                  console.log(
                    `Auto-fix: ${cell.displayAddress} → =${newFormula}`
                  );
                },
              });
            }
          }

          // Check cell below range
          const below = context.getCellAt(maxRow + 1, col);
          if (
            below &&
            below.type === "number" &&
            !(
              below.address.row === cell.address.row &&
              below.address.col === cell.address.col
            )
          ) {
            findings.push({
              id: generateId(),
              rule: this.name,
              severity: "high",
              title: `Range gap in ${cell.displayAddress}`,
              message: `${cell.displayAddress} uses ${range} but ${below.displayAddress} (value: ${below.rawValue}) is adjacent and excluded. Formula: =${cell.formula}`,
              cells: [cell.address, below.address],
              suggestion: `Extend range to ${startStr}:${cellToAddress(maxRow + 1, col)}`,
              autoFixable: true,
            });
          }
        }

        if (start.row === end.row) {
          // Row range — check cells left and right
          const row = start.row;
          const minCol = Math.min(start.col, end.col);
          const maxCol = Math.max(start.col, end.col);

          if (minCol > 0) {
            const left = context.getCellAt(row, minCol - 1);
            if (left && left.type === "number") {
              findings.push({
                id: generateId(),
                rule: this.name,
                severity: "high",
                title: `Range gap in ${cell.displayAddress}`,
                message: `${cell.displayAddress} uses ${range} but ${left.displayAddress} (value: ${left.rawValue}) is adjacent and excluded.`,
                cells: [cell.address, left.address],
                suggestion: `Extend range to ${cellToAddress(row, minCol - 1)}:${endStr}`,
                autoFixable: true,
              });
            }
          }

          const right = context.getCellAt(row, maxCol + 1);
          if (
            right &&
            right.type === "number" &&
            !(
              right.address.row === cell.address.row &&
              right.address.col === cell.address.col
            )
          ) {
            findings.push({
              id: generateId(),
              rule: this.name,
              severity: "high",
              title: `Range gap in ${cell.displayAddress}`,
              message: `${cell.displayAddress} uses ${range} but ${right.displayAddress} (value: ${right.rawValue}) is adjacent and excluded.`,
              cells: [cell.address, right.address],
              suggestion: `Extend range to ${startStr}:${cellToAddress(row, maxCol + 1)}`,
              autoFixable: true,
            });
          }
        }
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/hardcodedInFormula.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const hardcodedInFormulaRule: AuditRule = {
  name: "hardcoded-constants",
  description: "Detects magic numbers embedded in formulas",
  severity: "medium",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // Common acceptable constants
    const ACCEPTABLE = new Set([
      "0", "1", "2", "100", "12", "365", "52", "24", "60",
      "0.5", "1000", "10", "7",
    ]);

    for (const cell of context.formulaCells) {
      if (!cell.formula) continue;

      // Find numeric literals in formulas (not inside cell refs)
      const stripped = cell.formula.replace(/[A-Z]+\d+/g, ""); // remove cell refs
      const numbers = stripped.match(/\b\d+\.?\d*\b/g);

      if (!numbers) continue;

      const suspicious = numbers.filter((n) => !ACCEPTABLE.has(n));

      for (const num of suspicious) {
        findings.push({
          id: generateId(),
          rule: this.name,
          severity: "medium",
          title: `Magic number ${num} in ${cell.displayAddress}`,
          message: `Cell ${cell.displayAddress} contains hardcoded value ${num} in formula =${cell.formula}. Hardcoded values make spreadsheets fragile and hard to maintain.`,
          cells: [cell.address],
          suggestion: `Move ${num} to a dedicated input cell and reference it instead`,
          autoFixable: false,
        });
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/circularRefs.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const circularRefsRule: AuditRule = {
  name: "circular-references",
  description: "Detects circular formula dependencies",
  severity: "critical",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // Build dependency graph
    const deps = new Map<string, Set<string>>();

    for (const cell of context.formulaCells) {
      if (!cell.formula) continue;

      const refs = cell.formula.match(/[A-Z]+\d+/g) || [];
      const key = cell.displayAddress;

      if (!deps.has(key)) deps.set(key, new Set());
      for (const ref of refs) {
        deps.get(key)!.add(ref);
      }
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, path: string[]): string[] | null {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        return path.slice(cycleStart);
      }
      if (visited.has(node)) return null;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = deps.get(node) || new Set();
      for (const neighbor of neighbors) {
        const cycle = dfs(neighbor, [...path]);
        if (cycle) return cycle;
      }

      inStack.delete(node);
      return null;
    }

    const reportedCycles = new Set<string>();

    for (const node of deps.keys()) {
      visited.clear();
      inStack.clear();
      const cycle = dfs(node, []);

      if (cycle) {
        const cycleKey = [...cycle].sort().join(",");
        if (reportedCycles.has(cycleKey)) continue;
        reportedCycles.add(cycleKey);

        findings.push({
          id: generateId(),
          rule: this.name,
          severity: "critical",
          title: `Circular reference: ${cycle.join(" → ")} → ${cycle[0]}`,
          message: `Cells ${cycle.join(", ")} form a circular dependency chain. This will cause calculation errors.`,
          cells: cycle.map((addr) => {
            const match = addr.match(/^([A-Z]+)(\d+)$/);
            const col = match![1].charCodeAt(0) - 65;
            const row = parseInt(match![2], 10) - 1;
            return { sheet: 0, row, col };
          }),
          suggestion: "Break the circular chain by removing one of the dependencies",
          autoFixable: false,
        });
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/magnitudeOutliers.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const magnitudeOutliersRule: AuditRule = {
  name: "magnitude-outliers",
  description:
    "Detects numeric values that are statistical outliers within their row or column",
  severity: "low",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // Check each column
    const maxCol =
      Math.max(...context.allCells.map((c) => c.address.col), 0);

    for (let col = 0; col <= maxCol; col++) {
      const columnCells = context
        .getColumn(col)
        .filter((c) => c.type === "number" && typeof c.rawValue === "number");

      if (columnCells.length < 5) continue; // Need enough data

      const values = columnCells.map((c) => c.rawValue as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stddev = Math.sqrt(
        values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
      );

      if (stddev === 0) continue;

      for (const cell of columnCells) {
        const zScore = Math.abs((cell.rawValue as number) - mean) / stddev;

        if (zScore > 3) {
          findings.push({
            id: generateId(),
            rule: this.name,
            severity: "low",
            title: `Outlier in ${cell.displayAddress}`,
            message: `Value ${cell.rawValue} in ${cell.displayAddress} is ${zScore.toFixed(1)} standard deviations from the column mean (${mean.toFixed(2)}). This may be a data entry error.`,
            cells: [cell.address],
            suggestion: `Verify that ${cell.rawValue} is correct — it's unusually far from the other values in this column`,
            autoFixable: false,
          });
        }
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/volatileFunctions.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const volatileFunctionsRule: AuditRule = {
  name: "volatile-functions",
  description:
    "Flags use of volatile functions that recalculate on every change",
  severity: "info",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const VOLATILE = ["NOW", "TODAY", "RAND", "RANDBETWEEN", "INDIRECT", "OFFSET"];

    for (const cell of context.formulaCells) {
      if (!cell.formula) continue;

      for (const fn of VOLATILE) {
        if (cell.formula.toUpperCase().includes(`${fn}(`)) {
          findings.push({
            id: generateId(),
            rule: this.name,
            severity: "info",
            title: `Volatile function ${fn}() in ${cell.displayAddress}`,
            message: `Cell ${cell.displayAddress} uses ${fn}(), which recalculates every time any cell changes. This can cause performance issues in large spreadsheets.`,
            cells: [cell.address],
            suggestion:
              fn === "NOW" || fn === "TODAY"
                ? "Consider using a static date value if real-time updates aren't needed"
                : `Consider replacing ${fn}() with a non-volatile alternative`,
            autoFixable: false,
          });
        }
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/orphanedCells.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const orphanedCellsRule: AuditRule = {
  name: "orphaned-cells",
  description: "Detects formula cells that nothing else references",
  severity: "low",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // Build set of all referenced addresses
    const referenced = new Set<string>();

    for (const cell of context.formulaCells) {
      if (!cell.formula) continue;
      const refs = cell.formula.match(/[A-Z]+\d+/g) || [];
      for (const ref of refs) {
        referenced.add(ref);
      }
    }

    // Find formula cells that aren't referenced by anything
    for (const cell of context.formulaCells) {
      if (!referenced.has(cell.displayAddress)) {
        findings.push({
          id: generateId(),
          rule: this.name,
          severity: "low",
          title: `Orphaned formula in ${cell.displayAddress}`,
          message: `${cell.displayAddress} (=${cell.formula}) is not referenced by any other cell. It may be unused or a leftover from previous work.`,
          cells: [cell.address],
          suggestion: "Verify this cell is still needed, or remove it to reduce clutter",
          autoFixable: false,
        });
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/duplicateFormulas.ts`

```typescript
import { AuditRule, AuditFinding, AuditContext } from "../types";
import { generateId } from "../utils";

export const duplicateFormulasRule: AuditRule = {
  name: "duplicate-formulas",
  description: "Detects identical formulas that could be consolidated",
  severity: "info",

  run(context: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    const formulaMap = new Map<string, string[]>();

    for (const cell of context.formulaCells) {
      if (!cell.formula) continue;
      const key = cell.formula.toUpperCase().trim();
      if (!formulaMap.has(key)) formulaMap.set(key, []);
      formulaMap.get(key)!.push(cell.displayAddress);
    }

    for (const [formula, addresses] of formulaMap) {
      if (addresses.length >= 3) {
        findings.push({
          id: generateId(),
          rule: this.name,
          severity: "info",
          title: `Duplicate formula repeated ${addresses.length} times`,
          message: `Formula =${formula} appears identically in ${addresses.join(", ")}. This may indicate a copy-paste pattern that could be simplified.`,
          cells: addresses.map((addr) => {
            const match = addr.match(/^([A-Z]+)(\d+)$/);
            const col = match![1].charCodeAt(0) - 65;
            const row = parseInt(match![2], 10) - 1;
            return { sheet: 0, row, col };
          }),
          suggestion:
            "Consider whether these can be consolidated or if the repetition is intentional",
          autoFixable: false,
        });
      }
    }

    return findings;
  },
};
```

---

## `src/auditor/rules/index.ts`

```typescript
import { AuditRule } from "../types";
import { errorCellsRule } from "./errorCells";
import { inconsistentFormulasRule } from "./inconsistentFormulas";
import { rangeGapsRule } from "./rangGaps";
import { hardcodedInFormulaRule } from "./hardcodedInFormula";
import { circularRefsRule } from "./circularRefs";
import { magnitudeOutliersRule } from "./magnitudeOutliers";
import { volatileFunctionsRule } from "./volatileFunctions";
import { orphanedCellsRule } from "./orphanedCells";
import { duplicateFormulasRule } from "./duplicateFormulas";

export const ALL_RULES: AuditRule[] = [
  errorCellsRule,
  inconsistentFormulasRule,
  rangeGapsRule,
  hardcodedInFormulaRule,
  circularRefsRule,
  magnitudeOutliersRule,
  volatileFunctionsRule,
  orphanedCellsRule,
  duplicateFormulasRule,
];
```

---

## `src/auditor/index.ts` — Main Engine

```typescript
import { AuditResult, AuditContext, CellInfo, Severity } from "./types";
import { ALL_RULES } from "./rules";
import { cellToAddress, classifyCellType, isErrorValue, getErrorType } from "./utils";

export function runAudit(
  hfInstance: any,
  sheetIndex: number = 0,
  sheetName: string = "Sheet1"
): AuditResult {
  const startTime = performance.now();

  // Build cell grid from HyperFormula
  const sheetDimensions = hfInstance.getSheetDimensions(sheetIndex);
  const rows = sheetDimensions.height;
  const cols = sheetDimensions.width;

  const cellGrid: CellInfo[][] = [];
  const allCells: CellInfo[] = [];
  const formulaCells: CellInfo[] = [];

  for (let r = 0; r < rows; r++) {
    cellGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      const address = { sheet: sheetIndex, row: r, col: c };
      let formula: string | null = null;

      try {
        formula = hfInstance.getCellFormula(address);
        if (formula && typeof formula === "string") {
          // HyperFormula returns formula with = prefix sometimes
          formula = formula.startsWith("=") ? formula.substring(1) : formula;
        }
      } catch {
        formula = null;
      }

      let rawValue: any;
      try {
        rawValue = hfInstance.getCellValue(address);
      } catch {
        rawValue = null;
      }

      const computedValue = rawValue;
      const type = classifyCellType(rawValue, formula, computedValue);

      const cellInfo: CellInfo = {
        address,
        displayAddress: cellToAddress(r, c),
        rawValue,
        formula,
        computedValue,
        type,
        errorType: getErrorType(computedValue),
      };

      cellGrid[r][c] = cellInfo;
      if (type !== "empty") {
        allCells.push(cellInfo);
      }
      if (formula) {
        formulaCells.push(cellInfo);
      }
    }
  }

  // Build context
  const context: AuditContext = {
    cells: cellGrid,
    sheetName,
    sheetIndex,
    hf: hfInstance,
    allCells,
    formulaCells,

    getCellAt(row: number, col: number): CellInfo | null {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      const cell = cellGrid[row]?.[col];
      return cell?.type === "empty" ? null : cell;
    },

    getColumn(col: number): CellInfo[] {
      return cellGrid
        .map((row) => row[col])
        .filter((c) => c && c.type !== "empty");
    },

    getRow(row: number): CellInfo[] {
      return (cellGrid[row] || []).filter((c) => c && c.type !== "empty");
    },
  };

  // Run all rules
  const allFindings = ALL_RULES.flatMap((rule) => {
    try {
      return rule.run(context);
    } catch (err) {
      console.warn(`Audit rule "${rule.name}" failed:`, err);
      return [];
    }
  });

  // Sort by severity
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  allFindings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  // Calculate health score
  const weights: Record<Severity, number> = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
    info: 1,
  };
  const penalty = allFindings.reduce(
    (sum, f) => sum + weights[f.severity],
    0
  );
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const duration = performance.now() - startTime;

  // Generate summary
  const critCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  let summary: string;
  if (allFindings.length === 0) {
    summary = "No issues found. Your spreadsheet looks clean! ✅";
  } else if (critCount > 0) {
    summary = `Found ${allFindings.length} issues including ${critCount} critical. Immediate attention recommended. 🔴`;
  } else if (highCount > 0) {
    summary = `Found ${allFindings.length} issues including ${highCount} high priority. Review recommended. 🟠`;
  } else {
    summary = `Found ${allFindings.length} minor issues. Overall health is good. 🟡`;
  }

  return {
    timestamp: Date.now(),
    duration,
    totalCells: allCells.length,
    formulaCells: formulaCells.length,
    findings: allFindings,
    score,
    summary,
  };
}

export type { AuditResult, AuditFinding, Severity } from "./types";
```

---

## `src/components/AuditBadge.tsx`

```tsx
import React from "react";
import { Severity } from "../auditor/types";

interface AuditBadgeProps {
  severity: Severity;
}

const BADGE_STYLES: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: "#dc2626", text: "#fff", label: "Critical" },
  high: { bg: "#ea580c", text: "#fff", label: "High" },
  medium: { bg: "#ca8a04", text: "#fff", label: "Medium" },
  low: { bg: "#2563eb", text: "#fff", label: "Low" },
  info: { bg: "#6b7280", text: "#fff", label: "Info" },
};

export const AuditBadge: React.FC<AuditBadgeProps> = ({ severity }) => {
  const style = BADGE_STYLES[severity];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {style.label}
    </span>
  );
};
```

---

## `src/components/AuditFindingCard.tsx`

```tsx
import React, { useState } from "react";
import { AuditFinding } from "../auditor/types";
import { AuditBadge } from "./AuditBadge";

interface AuditFindingCardProps {
  finding: AuditFinding;
  onCellClick?: (row: number, col: number) => void;
  onFix?: (finding: AuditFinding) => void;
}

export const AuditFindingCard: React.FC<AuditFindingCardProps> = ({
  finding,
  onCellClick,
  onFix,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px",
        backgroundColor: "#1a1a2e",
        cursor: "pointer",
        transition: "border-color 0.2s",
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "#555")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "#333")
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
        }}
      >
        <AuditBadge severity={finding.severity} />
        {finding.autoFixable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFix?.(finding);
            }}
            style={{
              padding: "3px 10px",
              fontSize: "11px",
              borderRadius: "4px",
              border: "1px solid #4ade80",
              backgroundColor: "transparent",
              color: "#4ade80",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Fix
          </button>
        )}
      </div>

      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#e2e8f0",
          marginBottom: "4px",
        }}
      >
        {finding.title}
      </div>

      {expanded && (
        <>
          <div
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              marginBottom: "8px",
              lineHeight: "1.5",
            }}
          >
            {finding.message}
          </div>

          {finding.suggestion && (
            <div
              style={{
                fontSize: "12px",
                color: "#60a5fa",
                padding: "8px",
                backgroundColor: "#1e293b",
                borderRadius: "4px",
                borderLeft: "3px solid #3b82f6",
              }}
            >
              💡 {finding.suggestion}
            </div>
          )}

          {finding.cells.length > 0 && onCellClick && (
            <div style={{ marginTop: "8px" }}>
              {finding.cells.map((cell, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCellClick(cell.row, cell.col);
                  }}
                  style={{
                    padding: "2px 8px",
                    marginRight: "4px",
                    fontSize: "11px",
                    borderRadius: "3px",
                    border: "1px solid #475569",
                    backgroundColor: "#334155",
                    color: "#e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  Go to cell →
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
```

---

## `src/components/AuditPanel.tsx`

```tsx
import React, { useState, useCallback } from "react";
import { runAudit, AuditResult, AuditFinding } from "../auditor";
import { AuditFindingCard } from "./AuditFindingCard";
import { Severity } from "../auditor/types";

interface AuditPanelProps {
  hfInstance: any;
  onCellNavigate?: (row: number, col: number) => void;
  onApplyFix?: (finding: AuditFinding) => void;
}

export const AuditPanel: React.FC<AuditPanelProps> = ({
  hfInstance,
  onCellNavigate,
  onApplyFix,
}) => {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const handleRunAudit = useCallback(() => {
    if (!hfInstance) return;
    setLoading(true);

    // Use requestIdleCallback to avoid blocking UI
    requestAnimationFrame(() => {
      try {
        const auditResult = runAudit(hfInstance, 0, "Sheet1");
        setResult(auditResult);
      } catch (err) {
        console.error("Audit failed:", err);
      } finally {
        setLoading(false);
      }
    });
  }, [hfInstance]);

  const filteredFindings = result
    ? filter === "all"
      ? result.findings
      : result.findings.filter((f) => f.severity === filter)
    : [];

  const severityCounts = result
    ? {
        critical: result.findings.filter((f) => f.severity === "critical").length,
        high: result.findings.filter((f) => f.severity === "high").length,
        medium: result.findings.filter((f) => f.severity === "medium").length,
        low: result.findings.filter((f) => f.severity === "low").length,
        info: result.findings.filter((f) => f.severity === "info").length,
      }
    : null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
            🔍 Spreadsheet Auditor
          </h3>
          <button
            onClick={handleRunAudit}
            disabled={loading || !hfInstance}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: loading ? "#334155" : "#3b82f6",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analyzing..." : "Run Audit"}
          </button>
        </div>

        {/* Health Score */}
        {result && (
          <div style={{ marginTop: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                Health Score
              </span>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color:
                    result.score >= 80
                      ? "#4ade80"
                      : result.score >= 50
                        ? "#fbbf24"
                        : "#ef4444",
                }}
              >
                {result.score}/100
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: "6px",
                backgroundColor: "#1e293b",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${result.score}%`,
                  backgroundColor:
                    result.score >= 80
                      ? "#4ade80"
                      : result.score >= 50
                        ? "#fbbf24"
                        : "#ef4444",
                  borderRadius: "3px",
                  transition: "width 0.5s ease",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#94a3b8",
              }}
            >
              {result.summary} • {result.totalCells} cells analyzed (
              {result.formulaCells} formulas) in {result.duration.toFixed(0)}ms
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      {result && result.findings.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "8px 16px",
            borderBottom: "1px solid #1e293b",
            overflowX: "auto",
          }}
        >
          {(["all", "critical", "high", "medium", "low", "info"] as const).map(
            (sev) => {
              const count =
                sev === "all"
                  ? result.findings.length
                  : severityCounts?.[sev] || 0;
              if (sev !== "all" && count === 0) return null;

              return (
                <button
                  key={sev}
                  onClick={() => setFilter(sev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid",
                    borderColor:
                      filter === sev ? "#3b82f6" : "#334155",
                    backgroundColor:
                      filter === sev ? "#1e3a5f" : "transparent",
                    color: filter === sev ? "#60a5fa" : "#94a3b8",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}{" "}
                  ({count})
                </button>
              );
            }
          )}
        </div>
      )}

      {/* Findings List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
        }}
      >
        {!result && (
          <div
            style={{
              textAlign: "center",
              color: "#64748b",
              marginTop: "40px",
              fontSize: "13px",
            }}
          >
            Click "Run Audit" to analyze your spreadsheet
            <br />
            for errors, inconsistencies, and best practices
          </div>
        )}

        {result && filteredFindings.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#64748b",
              marginTop: "40px",
              fontSize: "13px",
            }}
          >
            No findings for this filter ✨
          </div>
        )}

        {filteredFindings.map((finding) => (
          <AuditFindingCard
            key={finding.id}
            finding={finding}
            onCellClick={onCellNavigate}
            onFix={onApplyFix}
          />
        ))}
      </div>
    </div>
  );
};
```

---

## Wiring Into Your App

In your main layout (wherever `ChatPanel` lives), add the `AuditPanel` as a sibling or tab:

```tsx
import { AuditPanel } from "./components/AuditPanel";

// Inside your layout:
<AuditPanel
  hfInstance={hfInstance}  // your HyperFormula instance
  onCellNavigate={(row, col) => {
    // scroll to and select that cell in SpreadsheetTable
    store.setSelectedCell(row, col);
  }}
  onApplyFix={(finding) => {
    // Apply auto-fix — finding.fix() modifies the formula
    if (finding.fix) {
      finding.fix();
      // Re-run audit after fix
    }
  }}
/>
```

---

## Injecting Audit Results into LLM Context

In your `chat.ts` route or wherever you build the prompt:

```typescript
// After running audit on the client, include findings in chat context
const auditSummary = auditResult.findings
  .filter(f => f.severity === "critical" || f.severity === "high")
  .map(f => `[${f.severity.toUpperCase()}] ${f.title}: ${f.message}`)
  .join("\n");

const systemPrompt = `
You are analyzing a spreadsheet. Here are the audit findings:

${auditSummary || "No significant issues found."}

Health Score: ${auditResult.score}/100
`;
```

---

## Why This Is Better Than Porting spreadsheet-auditor

| | Python `spreadsheet-auditor` | This native TS auditor |
|---|---|---|
| Runtime | Needs Python subprocess | Runs in browser |
| Data source | Needs raw `.xlsx` file | Uses existing HyperFormula instance |
| Latency | File upload → server → subprocess → parse | Instant (~50ms for 10K cells) |
| Integration | Separate service/process | Direct Zustand/HyperFormula access |
| Auto-fix | Returns suggestions only | Can modify cells directly |
| LLM context | Requires server roundtrip | Available immediately for chat |
| New dependencies | Python, openpyxl, subprocess | Zero — pure TypeScript |

**You get the same audit capabilities without any architectural complexity.** The rules above cover every major check that `spreadsheet-auditor` performs, adapted to work with data you already have in memory.