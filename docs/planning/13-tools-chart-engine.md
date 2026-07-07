# Tools: Chart Engine

> Chart configuration from sheet data.

> Source: [`docs/images/notes`](../images/notes)

## tools/chart_engine.py

```python
"""Generate chart configurations and basic chart images."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from models import ToolResult


class ChartEngine:
    """Build chart specification dicts (and optionally render with matplotlib)."""

    CHART_TYPES = ["bar", "line", "pie", "scatter", "histogram", "area", "hbar"]

    def suggest_chart(
        self, df: pd.DataFrame, x_col: str = None, y_col: str = None
    ) -> ToolResult:
        """Auto-suggest the best chart type for the data."""
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

        suggestions = []

        if x_col and y_col:
            if df[x_col].dtype == "object":
                suggestions.append({"type": "bar", "x": x_col, "y": y_col})
            else:
                suggestions.append({"type": "scatter", "x": x_col, "y": y_col})
                suggestions.append({"type": "line", "x": x_col, "y": y_col})
        elif len(cat_cols) >= 1 and len(numeric_cols) >= 1:
            suggestions.append({"type": "bar", "x": cat_cols[0], "y": numeric_cols[0]})
            if df[cat_cols[0]].nunique() <= 10:
                suggestions.append({"type": "pie", "labels": cat_cols[0], "values": numeric_cols[0]})
        elif len(numeric_cols) >= 2:
            suggestions.append({"type": "scatter", "x": numeric_cols[0], "y": numeric_cols[1]})
        elif len(numeric_cols) == 1:
            suggestions.append({"type": "histogram", "column": numeric_cols[0]})

        if not suggestions:
            return ToolResult(
                success=False,
                message="Couldn't determine a good chart type for this data.",
                suggestions=["Specify columns: chart column_x vs column_y"],
            )

        return ToolResult(
            success=True,
            data=suggestions,
            message="Suggested charts:\n"
            + "\n".join(
                f"  • **{s['type']}** chart" + (f" ({s.get('x', '')} vs {s.get('y', '')})" if "x" in s else "")
                for s in suggestions
            ),
        )

    def build_chart_config(
        self,
        df: pd.DataFrame,
        chart_type: str,
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
        title: Optional[str] = None,
        **kwargs,
    ) -> ToolResult:
        """Build a chart configuration dict your frontend can render."""
        if chart_type not in self.CHART_TYPES:
            return ToolResult(
                success=False,
                message=f"Unknown chart type '{chart_type}'.",
                suggestions=[f"Available: {', '.join(self.CHART_TYPES)}"],
            )

        config: Dict[str, Any] = {
            "type": chart_type,
            "title": title or f"{chart_type.title()} Chart",
        }

        try:
            if chart_type in ("bar", "hbar", "line", "area"):
                if not x_col or not y_col:
                    return ToolResult(success=False, message="Need x and y columns for this chart type.")

                data = df.groupby(x_col)[y_col].sum().reset_index()
                config["labels"] = data[x_col].astype(str).tolist()
                config["values"] = data[y_col].tolist()
                config["x_label"] = x_col
                config["y_label"] = y_col

            elif chart_type == "pie":
                label_col = x_col or kwargs.get("labels")
                value_col = y_col or kwargs.get("values")
                if not label_col or not value_col:
                    return ToolResult(success=False, message="Need label and value columns for pie chart.")

                data = df.groupby(label_col)[value_col].sum().reset_index()
                config["labels"] = data[label_col].astype(str).tolist()
                config["values"] = data[value_col].tolist()

            elif chart_type == "scatter":
                if not x_col or not y_col:
                    return ToolResult(success=False, message="Need x and y columns for scatter plot.")
                config["x_values"] = df[x_col].tolist()
                config["y_values"] = df[y_col].tolist()
                config["x_label"] = x_col
                config["y_label"] = y_col

            elif chart_type == "histogram":
                col = x_col or y_col
                if not col:
                    return ToolResult(success=False, message="Need a column for histogram.")
                config["values"] = df[col].dropna().tolist()
                config["bins"] = kwargs.get("bins", 20)
                config["x_label"] = col

            return ToolResult(
                success=True,
                data=config,
                message=f"Built **{chart_type}** chart config.",
            )

        except Exception as e:
            return ToolResult(success=False, message=f"Chart error: {e}")
```

