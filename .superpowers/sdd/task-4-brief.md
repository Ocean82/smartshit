### Task 4: Extract Function Metadata from HyperFormula

**Files:**
- Modify: `src/engine/spreadsheet.ts`

**Interfaces:**
- Consumes: HyperFormula instance (already loaded as `this.hf`)
- Produces: `getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }>`, `getFunctionInfo(name: string)`, and a fallback list of ~40 common functions

- [ ] **Step 1: Add function metadata methods to SpreadsheetEngine**

In `src/engine/spreadsheet.ts`, add these methods to the `SpreadsheetEngine` class (before the closing `}`):

```typescript
getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }> {
  if (!this.hf) return [];
  try {
    // HyperFormula v3.x API — get built-in function names
    const builtIn = (this.hf as any).constructor?.defaultConfig?.functionRegistry;
    if (!builtIn) {
      return this.getFallbackFunctions();
    }
    return Object.entries(builtIn).map(([name, info]: [string, any]) => ({
      name: name.toUpperCase(),
      description: info.description || '',
      category: info.category || 'General',
      syntax: info.syntax || name.toUpperCase() + '()',
    }));
  } catch {
    return this.getFallbackFunctions();
  }
}

getFunctionInfo(name: string): { name: string; description: string; category: string; syntax: string } | null {
  const fns = this.getFunctionList();
  return fns.find(f => f.name === name.toUpperCase()) || null;
}

private getFallbackFunctions(): Array<{ name: string; description: string; category: string; syntax: string }> {
  return [
    { name: 'SUM', description: 'Adds its arguments', category: 'Math', syntax: 'SUM(number1, [number2], ...)' },
    { name: 'AVERAGE', description: 'Returns the average of its arguments', category: 'Statistical', syntax: 'AVERAGE(number1, [number2], ...)' },
    { name: 'COUNT', description: 'Counts how many numbers are in the list of arguments', category: 'Statistical', syntax: 'COUNT(value1, [value2], ...)' },
    { name: 'COUNTA', description: 'Counts how many values are in the list of arguments', category: 'Statistical', syntax: 'COUNTA(value1, [value2], ...)' },
    { name: 'MAX', description: 'Returns the largest value', category: 'Statistical', syntax: 'MAX(number1, [number2], ...)' },
    { name: 'MIN', description: 'Returns the smallest value', category: 'Statistical', syntax: 'MIN(number1, [number2], ...)' },
    { name: 'IF', description: 'Specifies a logical test to perform', category: 'Logical', syntax: 'IF(condition, true_value, [false_value])' },
    { name: 'AND', description: 'Returns TRUE if all arguments are TRUE', category: 'Logical', syntax: 'AND(logical1, [logical2], ...)' },
    { name: 'OR', description: 'Returns TRUE if any argument is TRUE', category: 'Logical', syntax: 'OR(logical1, [logical2], ...)' },
    { name: 'NOT', description: 'Reverses the logical value', category: 'Logical', syntax: 'NOT(logical)' },
    { name: 'CONCATENATE', description: 'Joins several text strings into one', category: 'Text', syntax: 'CONCATENATE(text1, [text2], ...)' },
    { name: 'LEFT', description: 'Returns the leftmost characters', category: 'Text', syntax: 'LEFT(text, [num_chars])' },
    { name: 'RIGHT', description: 'Returns the rightmost characters', category: 'Text', syntax: 'RIGHT(text, [num_chars])' },
    { name: 'MID', description: 'Returns a specific number of characters from a text string', category: 'Text', syntax: 'MID(text, start_num, num_chars)' },
    { name: 'LEN', description: 'Returns the number of characters', category: 'Text', syntax: 'LEN(text)' },
    { name: 'TRIM', description: 'Removes spaces from text', category: 'Text', syntax: 'TRIM(text)' },
    { name: 'UPPER', description: 'Converts text to uppercase', category: 'Text', syntax: 'UPPER(text)' },
    { name: 'LOWER', description: 'Converts text to lowercase', category: 'Text', syntax: 'LOWER(text)' },
    { name: 'VLOOKUP', description: 'Looks for a value in the leftmost column', category: 'Lookup', syntax: 'VLOOKUP(lookup_value, table_array, col_index, [range_lookup])' },
    { name: 'HLOOKUP', description: 'Looks for a value in the top row', category: 'Lookup', syntax: 'HLOOKUP(lookup_value, table_array, row_index, [range_lookup])' },
    { name: 'INDEX', description: 'Returns a value from a position', category: 'Lookup', syntax: 'INDEX(array, row_num, [column_num])' },
    { name: 'MATCH', description: 'Returns an item position in a range', category: 'Lookup', syntax: 'MATCH(lookup_value, lookup_array, [match_type])' },
    { name: 'SUMIF', description: 'Adds cells that meet a condition', category: 'Math', syntax: 'SUMIF(range, criteria, [sum_range])' },
    { name: 'COUNTIF', description: 'Counts cells that meet a condition', category: 'Statistical', syntax: 'COUNTIF(range, criteria)' },
    { name: 'ROUND', description: 'Rounds a number to specified digits', category: 'Math', syntax: 'ROUND(number, num_digits)' },
    { name: 'ABS', description: 'Returns the absolute value', category: 'Math', syntax: 'ABS(number)' },
    { name: 'CEILING', description: 'Rounds up to nearest multiple', category: 'Math', syntax: 'CEILING(number, significance)' },
    { name: 'FLOOR', description: 'Rounds down to nearest multiple', category: 'Math', syntax: 'FLOOR(number, significance)' },
    { name: 'NOW', description: 'Returns current date and time', category: 'Date/Time', syntax: 'NOW()' },
    { name: 'TODAY', description: 'Returns current date', category: 'Date/Time', syntax: 'TODAY()' },
    { name: 'DATE', description: 'Creates a date from year, month, day', category: 'Date/Time', syntax: 'DATE(year, month, day)' },
    { name: 'YEAR', description: 'Returns the year from a date', category: 'Date/Time', syntax: 'YEAR(serial_number)' },
    { name: 'MONTH', description: 'Returns the month from a date', category: 'Date/Time', syntax: 'MONTH(serial_number)' },
    { name: 'DAY', description: 'Returns the day from a date', category: 'Date/Time', syntax: 'DAY(serial_number)' },
    { name: 'ROWS', description: 'Returns the number of rows', category: 'Lookup', syntax: 'ROWS(array)' },
    { name: 'COLUMNS', description: 'Returns the number of columns', category: 'Lookup', syntax: 'COLUMNS(array)' },
    { name: 'PI', description: 'Returns the value of pi', category: 'Math', syntax: 'PI()' },
    { name: 'POWER', description: 'Returns a number raised to a power', category: 'Math', syntax: 'POWER(number, power)' },
    { name: 'SQRT', description: 'Returns a positive square root', category: 'Math', syntax: 'SQRT(number)' },
    { name: 'MOD', description: 'Returns the remainder after division', category: 'Math', syntax: 'MOD(number, divisor)' },
    { name: 'INT', description: 'Rounds down to nearest integer', category: 'Math', syntax: 'INT(number)' },
    { name: 'AVERAGEIF', description: 'Returns average of cells meeting criteria', category: 'Statistical', syntax: 'AVERAGEIF(range, criteria, [average_range])' },
    { name: 'SUMPRODUCT', description: 'Returns sum of products', category: 'Math', syntax: 'SUMPRODUCT(array1, [array2], ...)' },
  ];
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass
