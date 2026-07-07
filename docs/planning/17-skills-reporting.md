# Skills: Reporting

> Report generation from spreadsheet data.

> Source: [`docs/images/notes`](../images/notes)

## skills/reporting.py

```python
"""Report generation skills."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd
from tabulate import tabulate

from models import ToolResult
from tools.analyzer import SpreadsheetAnalyzer


class ReportingSkill:
    """Generate text and structured reports from data."""

    def __init__(self):
        self.analyzer = SpreadsheetAnalyzer()

    def generate_summary_report(
        self, df: pd.DataFrame, title: str = "Data Summary Report"
    ) -> ToolResult:
        """Generate a comprehensive text report."""
        profile = self.analyzer.profile_sheet(df)
        sections: List[str] = []

        # Title
        sections.append(f"# {title}")
        sections.append(f"*{profile.row_count} rows × {profile.col_count} columns*\n")

        if profile.detected_purpose:
            sections.append(f"**Detected data type:** {profile.detected_purpose}\n")

        # Column overview
        sections.append("## Column Overview")
        col_table = []
        for cp in profile.columns:
            row = [cp.name, cp.role.value, cp.dtype, cp.non_null_count, cp.null_count]
            if cp.sum_val is not None:
                row.append(f"${cp.sum_val:,.2f}" if cp.role.value == "amount" else f"{cp.sum_val:,.2f}")
            else:
                row.append("—")
            col_table.append(row)

        sections.append(
            tabulate(col_table, headers=["Column", "Role", "Type", "Non-Null", "Missing", "Sum/Total"], tablefmt="pipe")
        )

        # Numeric summaries
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if numeric_cols:
            sections.append("\n## Numeric Summary")
            desc = df[numeric_cols].describe().round(2)
            sections.append(tabulate(desc, headers="keys", tablefmt="pipe"))

        # Category summaries
        cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
        if cat_cols:
            sections.append("\n## Category Summary")
            for col in cat_cols[:5]:
                vc = df[col].value_counts().head(8)
                sections.append(f"\n**{col}** ({df[col].nunique()} unique values):")
                for val, count in vc.items():
                    pct = count / len(df) * 100
                    sections.append(f"  • {val}: {count} ({pct:.1f}%)")

        # Data quality
        sections.append("\n## Data Quality")
        total_missing = df.isna().sum().sum()
        total_cells = df.shape[0] * df.shape[1]
        dupes = df.duplicated().sum()
        sections.append(f"  • Missing values: {total_missing} / {total_cells} ({total_missing/total_cells*100:.1f}%)")
        sections.append(f"  • Duplicate rows: {dupes}")

        report_text = "\n".join(sections)

        return ToolResult(
            success=True,
            data={"report_text": report_text, "profile": profile},
            message=report_text,
        )

    def generate_pivot_report(
        self,
        df: pd.DataFrame,
        index_col: str,
        value_col: str,
        columns_col: Optional[str] = None,
        agg_func: str = "sum",
    ) -> ToolResult:
        """Create a pivot table report."""
        try:
            pivot = pd.pivot_table(
                df,
                index=index_col,
                columns=columns_col,
                values=value_col,
                aggfunc=agg_func,
                fill_value=0,
                margins=True,
                margins_name="Total",
            )

            return ToolResult(
                success=True,
                data=pivot,
                message=f"Pivot table: {index_col} × {columns_col or 'Total'} → {agg_func}({value_col})",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Pivot error: {e}")
```

