# Tools: Formula Engine

> Formula templates and generation.

> Source: [`docs/images/notes`](../images/notes)

## tools/formula_engine.py

```python
"""Generate and evaluate formulas/computed columns."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd

from models import ToolResult


# ── Common formula templates ─────────────────────────────────────────────

_FORMULA_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "running_total": {
        "description": "Cumulative sum of a column",
        "fn": lambda df, col: df[col].cumsum(),
    },
    "pct_of_total": {
        "description": "Each value as a percentage of the column total",
        "fn": lambda df, col: (df[col] / df[col].sum() * 100).round(2),
    },
    "rank": {
        "description": "Rank values (1 = highest)",
        "fn": lambda df, col: df[col].rank(ascending=False).astype(int),
    },
    "month": {
        "description": "Extract month from a date column",
        "fn": lambda df, col: pd.to_datetime(df[col], errors="coerce").dt.month_name(),
    },
    "year": {
        "description": "Extract year from a date column",
        "fn": lambda df, col: pd.to_datetime(df[col], errors="coerce").dt.year,
    },
    "day_of_week": {
        "description": "Day of week from a date column",
        "fn": lambda df, col: pd.to_datetime(df[col], errors="coerce").dt.day_name(),
    },
    "pct_change": {
        "description": "Percentage change from previous row",
        "fn": lambda df, col: (df[col].pct_change() * 100).round(2),
    },
    "moving_avg_7": {
        "description": "7-period moving average",
        "fn": lambda df, col: df[col].rolling(window=7, min_periods=1).mean().round(2),
    },
    "z_score": {
        "description": "Z-score (standard deviations from mean)",
        "fn": lambda df, col: ((df[col] - df[col].mean()) / df[col].std()).round(3),
    },
    "is_above_avg": {
        "description": "TRUE if value is above the column average",
        "fn": lambda df, col: df[col] > df[col].mean(),
    },
}


class FormulaEngine:
    """Create computed columns and evaluate expressions."""

    def list_templates(self) -> ToolResult:
        """List all available formula templates."""
        items = []
        for name, info in _FORMULA_TEMPLATES.items():
            items.append(f"• **{name}** — {info['description']}")
        return ToolResult(
            success=True,
            data=list(_FORMULA_TEMPLATES.keys()),
            message="Available formula templates:\n" + "\n".join(items),
        )

    def apply_template(
        self,
        df: pd.DataFrame,
        template_name: str,
        source_column: str,
        new_column_name: Optional[str] = None,
    ) -> ToolResult:
        """Apply a formula template to create a new column."""
        if template_name not in _FORMULA_TEMPLATES:
            return ToolResult(
                success=False,
                message=f"Unknown template '{template_name}'.",
                suggestions=[f"Available: {', '.join(_FORMULA_TEMPLATES.keys())}"],
            )

        if source_column not in df.columns:
            return ToolResult(
                success=False,
                message=f"Column '{source_column}' not found.",
            )

        col_name = new_column_name or f"{source_column}_{template_name}"

        try:
            fn = _FORMULA_TEMPLATES[template_name]["fn"]
            df[col_name] = fn(df, source_column)
            return ToolResult(
                success=True,
                data=df,
                message=f"Created column **{col_name}** using `{template_name}` on `{source_column}`.",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Formula error: {e}")

    def evaluate_expression(
        self,
        df: pd.DataFrame,
        expression: str,
        new_column_name: str = "result",
    ) -> ToolResult:
        """Evaluate a pandas expression to create a new column.

        Example expressions:
            "Amount * 1.1"
            "Price * Quantity"
            "Revenue - Cost"
        """
        try:
            df[new_column_name] = df.eval(expression)
            return ToolResult(
                success=True,
                data=df,
                message=f"Computed **{new_column_name}** = `{expression}`",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Expression error: {e}")

    def aggregate(
        self,
        df: pd.DataFrame,
        group_by: List[str],
        agg_column: str,
        agg_func: str = "sum",
    ) -> ToolResult:
        """Group by + aggregate."""
        valid_funcs = ["sum", "mean", "median", "count", "min", "max", "std"]
        if agg_func not in valid_funcs:
            return ToolResult(
                success=False,
                message=f"Unknown aggregation '{agg_func}'.",
                suggestions=[f"Available: {', '.join(valid_funcs)}"],
            )

        missing = [c for c in group_by if c not in df.columns]
        if missing:
            return ToolResult(success=False, message=f"Columns not found: {', '.join(missing)}")
        if agg_column not in df.columns:
            return ToolResult(success=False, message=f"Column '{agg_column}' not found.")

        try:
            result = df.groupby(group_by)[agg_column].agg(agg_func).reset_index()
            result.columns = [*group_by, f"{agg_column}_{agg_func}"]
            return ToolResult(
                success=True,
                data=result,
                message=f"Grouped by {', '.join(group_by)} → {agg_func}({agg_column}). {len(result)} groups.",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Aggregation error: {e}")
```

