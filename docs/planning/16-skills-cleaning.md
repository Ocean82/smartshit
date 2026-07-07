# Skills: Cleaning

> Data cleaning and normalization workflows.

> Source: [`docs/images/notes`](../images/notes)

## skills/cleaning.py

```python
"""Data cleaning skills."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from models import ToolResult


class CleaningSkill:
    """Clean and normalize spreadsheet data."""

    def auto_clean(self, df: pd.DataFrame) -> ToolResult:
        """Apply common cleaning operations automatically."""
        actions: List[str] = []
        original_shape = df.shape

        # 1. Remove completely empty rows
        empty_rows = df.isna().all(axis=1).sum()
        if empty_rows > 0:
            df = df.dropna(how="all").reset_index(drop=True)
            actions.append(f"Removed {empty_rows} empty row(s)")

        # 2. Remove completely empty columns
        empty_cols = df.columns[df.isna().all()].tolist()
        if empty_cols:
            df = df.drop(columns=empty_cols)
            actions.append(f"Removed {len(empty_cols)} empty column(s): {', '.join(empty_cols)}")

        # 3. Strip whitespace from string columns
        str_cols = df.select_dtypes(include="object").columns
        for col in str_cols:
            df[col] = df[col].astype(str).str.strip().replace("nan", np.nan)
        if len(str_cols) > 0:
            actions.append(f"Trimmed whitespace in {len(str_cols)} text column(s)")

        # 4. Remove duplicate rows
        dupes = df.duplicated().sum()
        if dupes > 0:
            df = df.drop_duplicates().reset_index(drop=True)
            actions.append(f"Removed {dupes} duplicate row(s)")

        # 5. Standardize column names
        original_names = df.columns.tolist()
        df.columns = [
            col.strip().replace(" ", "_").replace(".", "_").lower()
            for col in df.columns
        ]
        renamed = sum(1 for a, b in zip(original_names, df.columns) if a != b)
        if renamed > 0:
            actions.append(f"Standardized {renamed} column name(s)")

        if not actions:
            actions.append("Data looks clean — no changes needed!")

        return ToolResult(
            success=True,
            data=df,
            message=f"### 🧹 Cleaning Report\n"
            + f"Shape: {original_shape} → {df.shape}\n"
            + "\n".join(f"  ✓ {a}" for a in actions),
        )

    def fill_missing(
        self,
        df: pd.DataFrame,
        column: str,
        strategy: str = "auto",
        fill_value: Any = None,
    ) -> ToolResult:
        """Fill missing values. Strategies: auto, mean, median, mode, forward, backward, value"""
        if column not in df.columns:
            return ToolResult(success=False, message=f"Column '{column}' not found.")

        missing_before = int(df[column].isna().sum())
        if missing_before == 0:
            return ToolResult(success=True, data=df, message=f"No missing values in '{column}'.")

        if strategy == "auto":
            if pd.api.types.is_numeric_dtype(df[column]):
                strategy = "median"
            else:
                strategy = "mode"

        if strategy == "mean":
            df[column] = df[column].fillna(df[column].mean())
        elif strategy == "median":
            df[column] = df[column].fillna(df[column].median())
        elif strategy == "mode":
            mode = df[column].mode()
            if len(mode) > 0:
                df[column] = df[column].fillna(mode[0])
        elif strategy == "forward":
            df[column] = df[column].ffill()
        elif strategy == "backward":
            df[column] = df[column].bfill()
        elif strategy == "value":
            df[column] = df[column].fillna(fill_value)
        else:
            return ToolResult(
                success=False,
                message=f"Unknown strategy '{strategy}'.",
                suggestions=["auto, mean, median, mode, forward, backward, value"],
            )

        missing_after = int(df[column].isna().sum())
        filled = missing_before - missing_after

        return ToolResult(
            success=True,
            data=df,
            message=f"Filled **{filled}** missing values in **{column}** using `{strategy}`.",
        )

    def remove_duplicates(
        self, df: pd.DataFrame, subset: List[str] = None, keep: str = "first"
    ) -> ToolResult:
        before = len(df)
        df = df.drop_duplicates(subset=subset, keep=keep).reset_index(drop=True)
        removed = before - len(df)
        return ToolResult(
            success=True,
            data=df,
            message=f"Removed **{removed}** duplicate rows. {len(df)} remaining.",
        )

    def convert_types(self, df: pd.DataFrame, conversions: Dict[str, str]) -> ToolResult:
        """Convert column types. Types: numeric, datetime, string, category"""
        actions = []
        for col, target_type in conversions.items():
            if col not in df.columns:
                continue
            try:
                if target_type == "numeric":
                    df[col] = pd.to_numeric(df[col], errors="coerce")
                elif target_type == "datetime":
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                elif target_type == "string":
                    df[col] = df[col].astype(str)
                elif target_type == "category":
                    df[col] = df[col].astype("category")
                actions.append(f"{col} → {target_type}")
            except Exception as e:
                actions.append(f"{col} → FAILED ({e})")

        return ToolResult(
            success=True,
            data=df,
            message="Type conversions:\n" + "\n".join(f"  • {a}" for a in actions),
        )
```

