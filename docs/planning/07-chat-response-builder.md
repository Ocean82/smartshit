# Chat: Response Builder

> Formats tool results into user-facing responses.

> Source: [`docs/images/notes`](../images/notes)

## chat/response_builder.py

```python
"""Build human-friendly responses from tool results."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd
from tabulate import tabulate

from models import ColumnProfile, SheetProfile, ToolResult


class ResponseBuilder:
    """Turns raw tool results into conversational responses."""

    @staticmethod
    def format_dataframe_preview(
        df: pd.DataFrame,
        max_rows: int = 15,
        title: Optional[str] = None,
    ) -> str:
        """Pretty-print a DataFrame slice."""
        parts = []
        if title:
            parts.append(f"**{title}**\n")

        rows, cols = df.shape
        if rows > max_rows:
            display_df = pd.concat([df.head(max_rows // 2), df.tail(max_rows // 2)])
            parts.append(
                tabulate(display_df, headers="keys", tablefmt="pipe", showindex=False)
            )
            parts.append(f"\n_...showing {max_rows} of {rows} rows_")
        else:
            parts.append(
                tabulate(df, headers="keys", tablefmt="pipe", showindex=False)
            )
            parts.append(f"\n_{rows} rows × {cols} columns_")

        return "\n".join(parts)

    @staticmethod
    def format_profile(profile: SheetProfile) -> str:
        """Format a sheet profile for the user."""
        lines = [
            f'### Sheet: "{profile.name}"',
            f"**Size:** {profile.row_count} rows × {profile.col_count} columns",
        ]

        if profile.detected_purpose:
            lines.append(f"**Detected purpose:** {profile.detected_purpose}")

        lines.append("\n**Columns:**")
        for col in profile.columns:
            desc = f"  • **{col.name}** — {col.role.value} ({col.dtype})"
            if col.null_count > 0:
                desc += f" | {col.null_count} missing"
            if col.role.value in ("amount", "quantity") and col.sum_val is not None:
                desc += f" | sum={col.sum_val:,.2f}"
            lines.append(desc)

        return "\n".join(lines)

    @staticmethod
    def format_analysis(analysis: Dict[str, Any]) -> str:
        """Format an analysis result dict into readable text."""
        parts = []

        if "summary" in analysis:
            parts.append(f"### Summary\n{analysis['summary']}")

        if "key_findings" in analysis:
            parts.append("\n### Key Findings")
            for i, finding in enumerate(analysis["key_findings"], 1):
                parts.append(f"  {i}. {finding}")

        if "statistics" in analysis:
            parts.append("\n### Statistics")
            for key, val in analysis["statistics"].items():
                if isinstance(val, float):
                    parts.append(f"  • **{key}:** {val:,.2f}")
                else:
                    parts.append(f"  • **{key}:** {val}")

        if "warnings" in analysis:
            parts.append("\n⚠️ **Warnings:**")
            for w in analysis["warnings"]:
                parts.append(f"  • {w}")

        return "\n".join(parts)

    @staticmethod
    def build_clarification(question: str, options: List[str] = None) -> str:
        """Ask the user for clarification."""
        parts = [f"I need a bit more info: **{question}**"]
        if options:
            parts.append("Options:")
            for i, opt in enumerate(options, 1):
                parts.append(f"  {i}. {opt}")
        return "\n".join(parts)

    @staticmethod
    def build_error(message: str, suggestions: List[str] = None) -> str:
        parts = [f"❌ {message}"]
        if suggestions:
            parts.append("\nHere's what you can try:")
            for s in suggestions:
                parts.append(f"  • {s}")
        return "\n".join(parts)

    @staticmethod
    def build_success(message: str, details: str = None) -> str:
        parts = [f"✅ {message}"]
        if details:
            parts.append(details)
        return "\n".join(parts)
```

