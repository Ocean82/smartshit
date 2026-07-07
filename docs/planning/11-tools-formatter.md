# Tools: Formatter

> Cell and sheet formatting operations.

> Source: [`docs/images/notes`](../images/notes)

## tools/formatter.py

```python
"""Spreadsheet formatting tools (for Excel output)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from models import ToolResult

try:
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


class SpreadsheetFormatter:
    """Apply formatting to openpyxl workbooks."""

    PRESET_STYLES = {
        "header": {
            "font": {"bold": True, "color": "FFFFFF", "size": 12},
            "fill": {"color": "4472C4"},
            "alignment": {"horizontal": "center"},
        },
        "currency": {
            "number_format": "$#,##0.00",
        },
        "percentage": {
            "number_format": "0.00%",
        },
        "date": {
            "number_format": "YYYY-MM-DD",
        },
        "highlight_positive": {
            "font": {"color": "006100"},
            "fill": {"color": "C6EFCE"},
        },
        "highlight_negative": {
            "font": {"color": "9C0006"},
            "fill": {"color": "FFC7CE"},
        },
        "total_row": {
            "font": {"bold": True, "size": 11},
            "fill": {"color": "D9E2F3"},
            "border": {"top": "thin"},
        },
    }

    def apply_style(self, ws, cell_range: str, style_name: str) -> ToolResult:
        """Apply a preset style to a cell range."""
        if not HAS_OPENPYXL:
            return ToolResult(success=False, message="openpyxl not available for formatting.")

        if style_name not in self.PRESET_STYLES:
            return ToolResult(
                success=False,
                message=f"Unknown style '{style_name}'.",
                suggestions=[f"Available: {', '.join(self.PRESET_STYLES.keys())}"],
            )

        style = self.PRESET_STYLES[style_name]

        try:
            for row in ws[cell_range]:
                for cell in (row if isinstance(row, tuple) else [row]):
                    self._apply_cell_style(cell, style)

            return ToolResult(
                success=True,
                message=f"Applied **{style_name}** style to {cell_range}.",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Formatting error: {e}")

    def auto_format_sheet(self, ws) -> ToolResult:
        """Auto-format an entire sheet with sensible defaults."""
        if not HAS_OPENPYXL:
            return ToolResult(success=False, message="openpyxl not available.")

        try:
            # Format header row
            header_style = self.PRESET_STYLES["header"]
            for cell in ws[1]:
                self._apply_cell_style(cell, header_style)

            # Auto-width columns
            for col_idx, col_cells in enumerate(ws.columns, 1):
                max_len = 0
                for cell in col_cells:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                adjusted = min(max_len + 4, 50)
                ws.column_dimensions[get_column_letter(col_idx)].width = adjusted

            # Freeze top row
            ws.freeze_panes = "A2"

            return ToolResult(success=True, message="Auto-formatted sheet with headers, column widths, and frozen panes.")
        except Exception as e:
            return ToolResult(success=False, message=f"Auto-format error: {e}")

    def _apply_cell_style(self, cell, style: dict):
        if "font" in style:
            f = style["font"]
            cell.font = Font(
                bold=f.get("bold", False),
                color=f.get("color"),
                size=f.get("size"),
            )
        if "fill" in style:
            cell.fill = PatternFill(
                start_color=style["fill"]["color"],
                end_color=style["fill"]["color"],
                fill_type="solid",
            )
        if "alignment" in style:
            cell.alignment = Alignment(**style["alignment"])
        if "number_format" in style:
            cell.number_format = style["number_format"]
        if "border" in style:
            sides = {}
            for pos, weight in style["border"].items():
                sides[pos] = Side(style=weight)
            cell.border = Border(**sides)
```

