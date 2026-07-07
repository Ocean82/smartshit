# Tools: Query Engine

> Natural-language queries over tabular data.

> Source: [`docs/images/notes`](../images/notes)

## tools/query_engine.py

```python
"""Natural language query → pandas operations."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import pandas as pd

from models import ToolResult


class QueryEngine:
    """Translate natural language queries into DataFrame operations."""

    def execute_query(self, df: pd.DataFrame, query: str) -> ToolResult:
        """Execute a natural language query against a DataFrame."""
        lower = query.lower().strip()

        # ── Aggregation queries ──────────────────────────────────────
        agg_match = re.search(
            r"(sum|total|average|mean|count|max|min|median)\s+(?:of\s+)?[\"']?(\w+)[\"']?",
            lower,
        )
        if agg_match:
            func_word = agg_match.group(1)
            col = self._resolve_column(df, agg_match.group(2))
            if col is None:
                return ToolResult(success=False, message=f"Column '{agg_match.group(2)}' not found.")

            func_map = {
                "sum": "sum", "total": "sum",
                "average": "mean", "mean": "mean",
                "count": "count", "max": "max",
                "min": "min", "median": "median",
            }
            func = func_map[func_word]
            result = getattr(df[col], func)()
            return ToolResult(
                success=True,
                data=result,
                message=f"The **{func}** of **{col}** is **{result:,.2f}**"
                if isinstance(result, float)
                else f"The **{func}** of **{col}** is **{result}**",
            )

        # ── "Top N" / "Bottom N" ─────────────────────────────────────
        top_match = re.search(
            r"(top|bottom|highest|lowest|largest|smallest)\s+(\d+)(?:\s+(?:by|in)\s+)?[\"']?(\w+)?[\"']?",
            lower,
        )
        if top_match:
            direction = top_match.group(1)
            n = int(top_match.group(2))
            col = self._resolve_column(df, top_match.group(3)) if top_match.group(3) else None

            if col is None:
                # Pick first numeric column
                num_cols = df.select_dtypes(include="number").columns
                col = num_cols[0] if len(num_cols) else None
            if col is None:
                return ToolResult(success=False, message="No numeric column found to rank.")

            ascending = direction in ("bottom", "lowest", "smallest")
            result = df.nlargest(n, col) if not ascending else df.nsmallest(n, col)

            return ToolResult(
                success=True,
                data=result,
                message=f"{'Bottom' if ascending else 'Top'} {n} by **{col}**:",
            )

        # ── "Group by" ───────────────────────────────────────────────
        group_match = re.search(
            r"(?:group|breakdown|by)\s+[\"']?(\w+)[\"']?", lower
        )
        if group_match:
            group_col = self._resolve_column(df, group_match.group(1))
            if group_col is None:
                return ToolResult(success=False, message=f"Column '{group_match.group(1)}' not found.")

            num_cols = df.select_dtypes(include="number").columns.tolist()
            if num_cols:
                result = df.groupby(group_col)[num_cols].sum().reset_index()
            else:
                result = df.groupby(group_col).size().reset_index(name="count")

            return ToolResult(
                success=True,
                data=result,
                message=f"Breakdown by **{group_col}**:",
            )

        # ── Generic "show me" / column lookup ────────────────────────
        show_match = re.search(r"(?:show|list|what are)\s+(?:me\s+)?(?:the\s+)?(.+)", lower)
        if show_match:
            target = show_match.group(1).strip()
            col = self._resolve_column(df, target)
            if col:
                unique = df[col].value_counts().head(20)
                return ToolResult(
                    success=True,
                    data=unique,
                    message=f"Values in **{col}** (top 20):",
                )

        return ToolResult(
            success=False,
            message="I didn't understand that query.",
            suggestions=[
                "Try: 'total of Amount'",
                "Try: 'top 5 by Revenue'",
                "Try: 'breakdown by Category'",
                "Try: 'show me the Status column'",
            ],
        )

    def _resolve_column(self, df: pd.DataFrame, name: str) -> Optional[str]:
        """Fuzzy match a column name."""
        if name is None:
            return None

        # Exact
        if name in df.columns:
            return name

        # Case-insensitive
        lower_map = {c.lower(): c for c in df.columns}
        if name.lower() in lower_map:
            return lower_map[name.lower()]

        # Partial match
        for col in df.columns:
            if name.lower() in col.lower() or col.lower() in name.lower():
                return col

        return None
```

