# Tools: Writer

> Write and mutate spreadsheet data.

> Source: [`docs/images/notes`](../images/notes)

## tools/writer.py

```python
"""Write and modify spreadsheet data."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import pandas as pd

from models import ToolResult


class SpreadsheetWriter:
    """Write, modify, and export spreadsheet data."""

    # ── Cell / Row / Column mutations ────────────────────────────────

    def set_cell(
        self, df: pd.DataFrame, row: int, col: Union[int, str], value: Any
    ) -> ToolResult:
        try:
            if isinstance(col, str):
                df.at[row, col] = value
            else:
                df.iat[row, col] = value
            return ToolResult(
                success=True,
                data=df,
                message=f"Set cell ({row}, {col}) to `{value}`.",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Error setting cell: {e}")

    def add_row(
        self, df: pd.DataFrame, row_data: Dict[str, Any], position: int = -1
    ) -> ToolResult:
        new_row = pd.DataFrame([row_data])
        if position == -1 or position >= len(df):
            df = pd.concat([df, new_row], ignore_index=True)
        else:
            top = df.iloc[:position]
            bottom = df.iloc[position:]
            df = pd.concat([top, new_row, bottom], ignore_index=True)

        return ToolResult(success=True, data=df, message="Row added.")

    def delete_rows(self, df: pd.DataFrame, indices: List[int]) -> ToolResult:
        before = len(df)
        df = df.drop(index=indices, errors="ignore").reset_index(drop=True)
        removed = before - len(df)
        return ToolResult(
            success=True,
            data=df,
            message=f"Removed {removed} row(s). {len(df)} remaining.",
        )

    def add_column(
        self,
        df: pd.DataFrame,
        name: str,
        values: Any = None,
        formula_fn=None,
    ) -> ToolResult:
        if name in df.columns:
            return ToolResult(success=False, message=f"Column '{name}' already exists.")

        if formula_fn is not None:
            df[name] = df.apply(formula_fn, axis=1)
        elif values is not None:
            df[name] = values
        else:
            df[name] = None

        return ToolResult(
            success=True,
            data=df,
            message=f"Added column **{name}**.",
        )

    def rename_columns(
        self, df: pd.DataFrame, mapping: Dict[str, str]
    ) -> ToolResult:
        missing = [c for c in mapping if c not in df.columns]
        if missing:
            return ToolResult(
                success=False,
                message=f"Columns not found: {', '.join(missing)}",
            )
        df = df.rename(columns=mapping)
        return ToolResult(success=True, data=df, message="Columns renamed.")

    def filter_rows(
        self,
        df: pd.DataFrame,
        column: str,
        operator: str,
        value: Any,
    ) -> ToolResult:
        """Filter rows by condition. Operators: ==, !=, >, <, >=, <=, contains, startswith"""
        if column not in df.columns:
            return ToolResult(success=False, message=f"Column '{column}' not found.")

        try:
            ops = {
                "==": lambda s, v: s == v,
                "!=": lambda s, v: s != v,
                ">": lambda s, v: s > v,
                "<": lambda s, v: s < v,
                ">=": lambda s, v: s >= v,
                "<=": lambda s, v: s <= v,
                "contains": lambda s, v: s.astype(str).str.contains(str(v), case=False, na=False),
                "startswith": lambda s, v: s.astype(str).str.startswith(str(v), na=False),
            }

            if operator not in ops:
                return ToolResult(
                    success=False,
                    message=f"Unknown operator '{operator}'.",
                    suggestions=[f"Available: {', '.join(ops.keys())}"],
                )

            mask = ops[operator](df[column], value)
            filtered = df[mask].reset_index(drop=True)

            return ToolResult(
                success=True,
                data=filtered,
                message=f"Filtered to {len(filtered)} rows where {column} {operator} {value}.",
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Filter error: {e}")

    def sort_data(
        self,
        df: pd.DataFrame,
        columns: List[str],
        ascending: Union[bool, List[bool]] = True,
    ) -> ToolResult:
        missing = [c for c in columns if c not in df.columns]
        if missing:
            return ToolResult(success=False, message=f"Columns not found: {', '.join(missing)}")

        df = df.sort_values(by=columns, ascending=ascending).reset_index(drop=True)
        direction = "ascending" if ascending else "descending"
        return ToolResult(
            success=True,
            data=df,
            message=f"Sorted by {', '.join(columns)} ({direction}).",
        )

    # ── Export ───────────────────────────────────────────────────────

    def export(
        self,
        sheets: Dict[str, pd.DataFrame],
        output_path: str,
        file_format: str = "xlsx",
    ) -> ToolResult:
        try:
            path = Path(output_path)

            if file_format == "xlsx":
                with pd.ExcelWriter(path, engine="openpyxl") as writer:
                    for name, df in sheets.items():
                        df.to_excel(writer, sheet_name=name, index=False)

            elif file_format == "csv":
                # Export first sheet or all as separate files
                if len(sheets) == 1:
                    name, df = next(iter(sheets.items()))
                    df.to_csv(path, index=False)
                else:
                    for name, df in sheets.items():
                        p = path.with_name(f"{path.stem}_{name}.csv")
                        df.to_csv(p, index=False)

            elif file_format == "json":
                if len(sheets) == 1:
                    df = next(iter(sheets.values()))
                    df.to_json(path, orient="records", indent=2)
                else:
                    import json
                    all_data = {
                        name: df.to_dict(orient="records")
                        for name, df in sheets.items()
                    }
                    path.write_text(json.dumps(all_data, indent=2, default=str))
            else:
                return ToolResult(
                    success=False,
                    message=f"Unsupported export format: {file_format}",
                )

            return ToolResult(
                success=True,
                message=f"Exported to **{path.name}**",
                metadata={"path": str(path.resolve())},
            )
        except Exception as e:
            return ToolResult(success=False, message=f"Export error: {e}")
```

