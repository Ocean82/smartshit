# Tools: Reader

> Read and profile spreadsheet files.

> Source: [`docs/images/notes`](../images/notes)

## tools/reader.py

```python
"""Read and parse spreadsheet files into DataFrames."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

from config import DEFAULT_CONFIG, BrainConfig
from models import SpreadsheetState, ToolResult


class SpreadsheetReader:
    """Reads Excel / CSV files and loads them into state."""

    def __init__(self, config: BrainConfig = DEFAULT_CONFIG):
        self.config = config

    def read_file(self, file_path: str) -> ToolResult:
        """Read a spreadsheet file and return populated SpreadsheetState."""
        path = Path(file_path)

        # Validate
        if not path.exists():
            return ToolResult(
                success=False,
                message=f"File not found: {file_path}",
                suggestions=["Check the file path and try again."],
            )

        ext = path.suffix.lower()
        if ext not in self.config.supported_extensions:
            return ToolResult(
                success=False,
                message=f"Unsupported file type: {ext}",
                suggestions=[
                    f"Supported types: {', '.join(self.config.supported_extensions)}"
                ],
            )

        size_mb = path.stat().st_size / (1024 * 1024)
        if size_mb > self.config.max_file_size_mb:
            return ToolResult(
                success=False,
                message=f"File too large ({size_mb:.1f} MB). Max is {self.config.max_file_size_mb} MB.",
            )

        try:
            sheets = self._load(path, ext)
        except Exception as e:
            return ToolResult(
                success=False,
                message=f"Error reading file: {e}",
                suggestions=["Make sure the file isn't corrupted or password-protected."],
            )

        state = SpreadsheetState(
            file_path=str(path.resolve()),
            file_name=path.name,
            sheets=sheets,
            active_sheet=list(sheets.keys())[0] if sheets else None,
            loaded_at=datetime.now(),
        )

        sheet_summary = ", ".join(
            f'"{name}" ({df.shape[0]}×{df.shape[1]})'
            for name, df in sheets.items()
        )

        return ToolResult(
            success=True,
            data=state,
            message=f"Loaded **{path.name}** with {len(sheets)} sheet(s): {sheet_summary}",
            suggestions=[
                "Ask me to **analyze** or **summarize** any sheet.",
                "Say **show me the first 10 rows** to preview data.",
            ],
        )

    def read_from_bytes(self, file_bytes: bytes, filename: str) -> ToolResult:
        """Read from in-memory bytes (for web uploads)."""
        import io

        ext = Path(filename).suffix.lower()
        try:
            if ext == ".csv":
                df = pd.read_csv(io.BytesIO(file_bytes))
                sheets = {"Sheet1": df}
            elif ext == ".tsv":
                df = pd.read_csv(io.BytesIO(file_bytes), sep="\t")
                sheets = {"Sheet1": df}
            else:
                xls = pd.ExcelFile(io.BytesIO(file_bytes))
                sheets = {
                    name: xls.parse(name) for name in xls.sheet_names
                }
        except Exception as e:
            return ToolResult(success=False, message=f"Error reading upload: {e}")

        state = SpreadsheetState(
            file_path=None,
            file_name=filename,
            sheets=sheets,
            active_sheet=list(sheets.keys())[0],
            loaded_at=datetime.now(),
        )

        return ToolResult(
            success=True,
            data=state,
            message=f"Loaded **{filename}** — {len(sheets)} sheet(s).",
            suggestions=["What would you like to do with this data?"],
        )

    # ── Private ──────────────────────────────────────────────────────

    def _load(self, path: Path, ext: str) -> Dict[str, pd.DataFrame]:
        if ext == ".csv":
            df = pd.read_csv(path)
            return {"Sheet1": df}
        elif ext == ".tsv":
            df = pd.read_csv(path, sep="\t")
            return {"Sheet1": df}
        else:
            xls = pd.ExcelFile(path)
            return {name: xls.parse(name) for name in xls.sheet_names}

    def get_preview(
        self, df: pd.DataFrame, n: int = None
    ) -> ToolResult:
        """Return first N rows."""
        n = n or self.config.max_rows_preview
        preview = df.head(n)
        return ToolResult(
            success=True,
            data=preview,
            message=f"Showing first {min(n, len(df))} of {len(df)} rows.",
        )
```

