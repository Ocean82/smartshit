# Tools: Analyzer

> Pattern detection, statistics, and insights.

> Source: [`docs/images/notes`](../images/notes)

## tools/analyzer.py

```python
"""Analyze spreadsheet data — profiling, statistics, patterns."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from config import DEFAULT_CONFIG, BrainConfig
from models import ColumnProfile, ColumnRole, SheetProfile, ToolResult


class SpreadsheetAnalyzer:
    """Deep analysis of spreadsheet data."""

    def __init__(self, config: BrainConfig = DEFAULT_CONFIG):
        self.config = config

    # ── Profiling ────────────────────────────────────────────────────

    def profile_sheet(self, df: pd.DataFrame, sheet_name: str = "Sheet1") -> SheetProfile:
        """Build a full profile of a sheet."""
        columns = []
        for col in df.columns:
            columns.append(self._profile_column(df[col]))

        purpose = self._detect_purpose(df, columns)

        # Check for a totals row (last row with "total" in any text cell)
        has_totals = False
        if len(df) > 0:
            last_row = df.iloc[-1]
            for val in last_row:
                if isinstance(val, str) and "total" in val.lower():
                    has_totals = True
                    break

        # Date range
        date_range = None
        date_cols = [c for c in columns if c.role == ColumnRole.DATE]
        if date_cols:
            try:
                dates = pd.to_datetime(df[date_cols[0].name], errors="coerce").dropna()
                if len(dates):
                    date_range = (dates.min().isoformat(), dates.max().isoformat())
            except Exception:
                pass

        return SheetProfile(
            name=sheet_name,
            row_count=len(df),
            col_count=len(df.columns),
            columns=columns,
            detected_purpose=purpose,
            has_totals_row=has_totals,
            date_range=date_range,
        )

    def _profile_column(self, series: pd.Series) -> ColumnProfile:
        name = str(series.name)
        non_null = series.dropna()
        dtype = str(series.dtype)
        unique_count = non_null.nunique()

        profile = ColumnProfile(
            name=name,
            dtype=dtype,
            role=self._detect_column_role(series, name),
            non_null_count=len(non_null),
            null_count=series.isna().sum(),
            unique_count=unique_count,
            sample_values=non_null.head(5).tolist(),
        )

        # Numeric stats
        if pd.api.types.is_numeric_dtype(series):
            profile.min_val = float(non_null.min()) if len(non_null) else None
            profile.max_val = float(non_null.max()) if len(non_null) else None
            profile.mean_val = float(non_null.mean()) if len(non_null) else None
            profile.median_val = float(non_null.median()) if len(non_null) else None
            profile.std_val = float(non_null.std()) if len(non_null) > 1 else None
            profile.sum_val = float(non_null.sum()) if len(non_null) else None

        return profile

    def _detect_column_role(self, series: pd.Series, name: str) -> ColumnRole:
        lower_name = name.lower().strip()

        # Name-based heuristics
        if any(w in lower_name for w in ["date", "time", "day", "month", "year", "created", "updated"]):
            return ColumnRole.DATE
        if any(w in lower_name for w in ["amount", "price", "cost", "total", "revenue", "salary", "payment", "fee", "balance"]):
            return ColumnRole.AMOUNT
        if any(w in lower_name for w in ["qty", "quantity", "count", "number", "units"]):
            return ColumnRole.QUANTITY
        if any(w in lower_name for w in ["category", "type", "group", "department", "status", "class"]):
            return ColumnRole.CATEGORY
        if any(w in lower_name for w in ["id", "code", "key", "ref"]):
            return ColumnRole.ID
        if any(w in lower_name for w in ["percent", "pct", "rate", "%"]):
            return ColumnRole.PERCENTAGE
        if any(w in lower_name for w in ["name", "label", "title", "item"]):
            return ColumnRole.LABEL
        if any(w in lower_name for w in ["description", "desc", "note", "comment", "remarks"]):
            return ColumnRole.DESCRIPTION

        # Data-type heuristics
        if pd.api.types.is_datetime64_any_dtype(series):
            return ColumnRole.DATE

        non_null = series.dropna()
        if len(non_null) == 0:
            return ColumnRole.UNKNOWN

        if pd.api.types.is_numeric_dtype(series):
            # Check if values look like percentages
            if non_null.between(0, 1).all() or non_null.between(0, 100).all():
                return ColumnRole.PERCENTAGE
            return ColumnRole.AMOUNT

        # Try to parse as dates
        if series.dtype == object:
            try:
                parsed = pd.to_datetime(non_null.head(20), errors="coerce")
                if parsed.notna().sum() > len(parsed) * 0.8:
                    return ColumnRole.DATE
            except Exception:
                pass

            # High cardinality text → description; low → category
            if non_null.nunique() / max(len(non_null), 1) > 0.8:
                return ColumnRole.DESCRIPTION
            else:
                return ColumnRole.CATEGORY

        return ColumnRole.UNKNOWN

    def _detect_purpose(
        self, df: pd.DataFrame, columns: List[ColumnProfile]
    ) -> Optional[str]:
        roles = {c.role for c in columns}
        names_lower = {c.name.lower() for c in columns}

        if {ColumnRole.AMOUNT, ColumnRole.CATEGORY}.issubset(roles):
            if any(w in " ".join(names_lower) for w in ["expense", "income", "budget", "spend"]):
                return "Budget / Financial Tracking"
            return "Financial Data"

        if ColumnRole.DATE in roles and ColumnRole.AMOUNT in roles:
            return "Time-series Financial Data"

        if {ColumnRole.QUANTITY, ColumnRole.LABEL}.issubset(roles):
            return "Inventory / Product List"

        if ColumnRole.DATE in roles and ColumnRole.CATEGORY in roles:
            return "Event / Activity Log"

        return None

    # ── Statistical Analysis ─────────────────────────────────────────

    def analyze(
        self,
        df: pd.DataFrame,
        sheet_name: str = "Sheet1",
        focus_columns: List[str] = None,
    ) -> ToolResult:
        """Full statistical analysis of a DataFrame."""
        profile = self.profile_sheet(df, sheet_name)

        if focus_columns:
            missing = [c for c in focus_columns if c not in df.columns]
            if missing:
                return ToolResult(
                    success=False,
                    message=f"Columns not found: {', '.join(missing)}",
                    suggestions=[f"Available columns: {', '.join(df.columns.tolist())}"],
                )
            work_df = df[focus_columns]
        else:
            work_df = df

        findings: List[str] = []
        statistics: Dict[str, Any] = {}
        warnings: List[str] = []

        # Basic stats
        statistics["total_rows"] = len(df)
        statistics["total_columns"] = len(df.columns)
        statistics["missing_cells"] = int(df.isna().sum().sum())
        statistics["duplicate_rows"] = int(df.duplicated().sum())

        if statistics["missing_cells"] > 0:
            pct = statistics["missing_cells"] / (len(df) * len(df.columns)) * 100
            warnings.append(f"{statistics['missing_cells']} missing values ({pct:.1f}% of all cells)")

        if statistics["duplicate_rows"] > 0:
            warnings.append(f"{statistics['duplicate_rows']} duplicate rows found")

        # Numeric analysis
        numeric_cols = work_df.select_dtypes(include=[np.number]).columns.tolist()
        for col in numeric_cols:
            series = work_df[col].dropna()
            if len(series) == 0:
                continue

            col_stats = {
                "min": float(series.min()),
                "max": float(series.max()),
                "mean": float(series.mean()),
                "median": float(series.median()),
                "sum": float(series.sum()),
            }
            statistics[col] = col_stats

            # Outliers
            if len(series) > 10:
                std = series.std()
                mean = series.mean()
                outliers = series[
                    (series < mean - self.config.outlier_std_threshold * std)
                    | (series > mean + self.config.outlier_std_threshold * std)
                ]
                if len(outliers) > 0:
                    findings.append(
                        f"Column **{col}** has {len(outliers)} outlier(s) beyond {self.config.outlier_std_threshold}σ."
                    )

        # Top categories
        cat_cols = work_df.select_dtypes(include=["object", "category"]).columns.tolist()
        for col in cat_cols[:5]:
            top = work_df[col].value_counts().head(5)
            if len(top) > 0:
                top_item = top.index[0]
                findings.append(
                    f"Most common **{col}**: \"{top_item}\" ({top.iloc[0]} occurrences)"
                )

        # Correlations between numeric columns
        if len(numeric_cols) >= 2:
            corr_matrix = work_df[numeric_cols].corr()
            for i, c1 in enumerate(numeric_cols):
                for c2 in numeric_cols[i + 1 :]:
                    r = corr_matrix.loc[c1, c2]
                    if abs(r) >= self.config.correlation_threshold:
                        direction = "positive" if r > 0 else "negative"
                        findings.append(
                            f"Strong {direction} correlation between **{c1}** and **{c2}** (r={r:.2f})"
                        )

        # Build summary
        summary_parts = [f"Analyzed sheet **\"{sheet_name}\"** with {len(df)} rows and {len(df.columns)} columns."]
        if profile.detected_purpose:
            summary_parts.append(f"This looks like **{profile.detected_purpose}** data.")

        analysis = {
            "summary": " ".join(summary_parts),
            "key_findings": findings if findings else ["No notable patterns found."],
            "statistics": statistics,
            "warnings": warnings,
            "profile": profile,
        }

        suggestions = [
            "Ask me to **filter** or **sort** by any column.",
            "Say **chart <column>** to visualize data.",
        ]
        if profile.detected_purpose and "budget" in (profile.detected_purpose or "").lower():
            suggestions.insert(0, "I can do a **budget breakdown** — just ask!")

        return ToolResult(
            success=True,
            data=analysis,
            message="Analysis complete.",
            suggestions=suggestions,
        )

    # ── Quick helpers ────────────────────────────────────────────────

    def get_column_stats(self, df: pd.DataFrame, column: str) -> ToolResult:
        if column not in df.columns:
            return ToolResult(success=False, message=f"Column '{column}' not found.")

        series = df[column]
        profile = self._profile_column(series)

        stats = {
            "name": profile.name,
            "type": profile.dtype,
            "role": profile.role.value,
            "non_null": profile.non_null_count,
            "missing": profile.null_count,
            "unique": profile.unique_count,
        }

        if profile.sum_val is not None:
            stats.update({
                "min": profile.min_val,
                "max": profile.max_val,
                "mean": profile.mean_val,
                "median": profile.median_val,
                "sum": profile.sum_val,
            })

        return ToolResult(
            success=True,
            data=stats,
            message=f"Stats for column **{column}**",
        )

    def find_trends(self, df: pd.DataFrame, date_col: str, value_col: str) -> ToolResult:
        """Detect trends over time."""
        if date_col not in df.columns or value_col not in df.columns:
            return ToolResult(success=False, message="Column(s) not found.")

        work = df[[date_col, value_col]].copy()
        work[date_col] = pd.to_datetime(work[date_col], errors="coerce")
        work = work.dropna().sort_values(date_col)

        if len(work) < self.config.trend_min_points:
            return ToolResult(
                success=False,
                message=f"Need at least {self.config.trend_min_points} data points for trend analysis.",
            )

        # Simple linear trend
        x = np.arange(len(work))
        y = work[value_col].values.astype(float)
        slope, intercept = np.polyfit(x, y, 1)

        direction = "upward" if slope > 0 else "downward" if slope < 0 else "flat"
        pct_change = ((y[-1] - y[0]) / abs(y[0]) * 100) if y[0] != 0 else 0

        findings = [
            f"Overall **{direction}** trend in **{value_col}** over time.",
            f"Change from first to last: **{pct_change:+.1f}%**",
            f"Average per-period change: **{slope:+.2f}**",
        ]

        return ToolResult(
            success=True,
            data={"slope": slope, "direction": direction, "pct_change": pct_change},
            message="\n".join(findings),
        )
```

