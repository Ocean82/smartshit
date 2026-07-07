# Integration Example

> How an external agent calls brain.process().

> Source: [`docs/images/notes`](../images/notes)

## Integration Example — How Your Agent Uses It

```python
"""
Example showing how to wire SpreadsheetBrain into your existing agent.
"""

from spreadsheet_brain.brain import SpreadsheetBrain


# ── Initialize once ──────────────────────────────────────────────────
brain = SpreadsheetBrain()


# ── Your agent's tool function that the LLM can call ─────────────────

def spreadsheet_tool(
    user_message: str,
    file_path: str = None,
    file_bytes: bytes = None,
    file_name: str = None,
) -> dict:
    """
    The single function your agent framework calls.
    Works with LangChain, CrewAI, AutoGen, or any custom agent.
    """
    return brain.process(
        user_message=user_message,
        file_path=file_path,
        file_bytes=file_bytes,
        file_name=file_name,
    )


# ── Example conversation flow ────────────────────────────────────────

if __name__ == "__main__":
    # 1. User uploads a file
    result = brain.load_file("monthly_budget.xlsx")
    print(result["response"])
    # → "Loaded monthly_budget.xlsx with 1 sheet(s): "Sheet1" (150×6)"

    # 2. User asks to analyze budget
    result = brain.process("Read and analyze my budget")
    print(result["response"])
    # → Full budget analysis with totals, categories, trends, etc.

    # 3. User asks a specific question
    result = brain.process("What's my total spending on Food?")
    print(result["response"])
    # → "The sum of Amount where Category is Food is $2,340.00"

    # 4. User wants a chart
    result = brain.process("Create a pie chart of spending by category")
    print(result["chart_config"])
    # → {"type": "pie", "labels": [...], "values": [...], ...}

    # 5. User wants to clean data
    result = brain.process("Clean up this data")
    print(result["response"])
    # → "Removed 3 duplicates, trimmed whitespace, standardized column names"

    # 6. User wants a report
    result = brain.process("Generate a summary report")
    print(result["response"])
    # → Full formatted markdown report

    # 7. Get context for your agent's system prompt
    context = brain.get_context_summary()
    # → "Loaded file: monthly_budget.xlsx, Sheets: Sheet1, ..."

    # 8. Undo last change
    result = brain.undo()
    print(result["response"])
```

