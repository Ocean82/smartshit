# Skills: Budget

> Budget-specific analysis and recommendations.

> Source: [`docs/images/notes`](../images/notes)

## skills/budget.py

```python
"""Budget-specific analysis skills."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from models import ColumnRole, ToolResult
from tools.analyzer import SpreadsheetAnalyzer


class BudgetSkill:
    """Specialized budget & financial analysis."""

    def __init__(self):
        self.analyzer = SpreadsheetAnalyzer()

    def analyze_budget(
        self,
        df: pd.DataFrame,
        amount_col: Optional[str] = None,
        category_col: Optional[str] = None,
        date_col: Optional[str] = None,
    ) -> ToolResult:
        """Full budget analysis — auto-detects columns if not specified."""
        profile = self.analyzer.profile_sheet(df, "Budget")

        # Auto-detect columns
        if not amount_col:
            amount_col = self._find_col_by_role(profile, ColumnRole.AMOUNT)
        if not category_col:
            category_col = self._find_col_by_role(profile, ColumnRole.CATEGORY)
        if not date_col:
            date_col = self._find_col_by_role(profile, ColumnRole.DATE)

        if not amount_col:
            return ToolResult(
                success=False,
                message="Couldn't find an amount/money column in your data.",
                suggestions=[
                    f"Available columns: {', '.join(df.columns.tolist())}",
                    "Tell me which column has the dollar amounts.",
                ],
            )

        findings: List[str] = []
        stats: Dict[str, Any] = {}

        # Ensure numeric
        df[amount_col] = pd.to_numeric(df[amount_col], errors="coerce")
        amounts = df[amount_col].dropna()

        # Basic totals
        total = float(amounts.sum())
        avg = float(amounts.mean())
        median = float(amounts.median())
        stats["total"] = total
        stats["average_transaction"] = avg
        stats["median_transaction"] = median
        stats["transaction_count"] = len(amounts)

        findings.append(f"**Total:** ${total:,.2f} across {len(amounts)} transactions")
        findings.append(f"**Average transaction:** ${avg:,.2f} | **Median:** ${median:,.2f}")

        # Income vs Expenses (if there are positive and negative values)
        income = amounts[amounts > 0]
        expenses = amounts[amounts < 0]

        if len(income) > 0 and len(expenses) > 0:
            total_income = float(income.sum())
            total_expenses = float(expenses.sum())
            net = total_income + total_expenses
            stats["income"] = total_income
            stats["expenses"] = total_expenses
            stats["net"] = net
            findings.append(
                f"**Income:** ${total_income:,.2f} | **Expenses:** ${abs(total_expenses):,.2f} | **Net:** ${net:,.2f}"
            )
            if net < 0:
                findings.append("⚠️ You're spending more than you're earning!")
            else:
                savings_rate = (net / total_income) * 100
                stats["savings_rate"] = savings_rate
                findings.append(f"💰 **Savings rate:** {savings_rate:.1f}%")

        # Category breakdown
        category_breakdown = None
        if category_col and category_col in df.columns:
            category_breakdown = (
                df.groupby(category_col)[amount_col]
                .agg(["sum", "count", "mean"])
                .sort_values("sum", ascending=False)
                .reset_index()
            )
            category_breakdown.columns = [category_col, "Total", "Count", "Average"]

            findings.append(f"\n**Spending by {category_col}:**")
            for _, row in category_breakdown.head(10).iterrows():
                pct = abs(row["Total"]) / abs(total) * 100 if total != 0 else 0
                findings.append(
                    f"  • **{row[category_col]}**: ${row['Total']:,.2f} ({pct:.1f}%) — {int(row['Count'])} transactions"
                )

            # Largest category
            top_cat = category_breakdown.iloc[0]
            stats["top_category"] = top_cat[category_col]
            stats["top_category_total"] = float(top_cat["Total"])

        # Monthly trends
        monthly_data = None
        if date_col and date_col in df.columns:
            df["_parsed_date"] = pd.to_datetime(df[date_col], errors="coerce")
            valid_dates = df.dropna(subset=["_parsed_date"]).copy()

            if len(valid_dates) > 0:
                valid_dates["_month"] = valid_dates["_parsed_date"].dt.to_period("M")
                monthly_data = (
                    valid_dates.groupby("_month")[amount_col]
                    .agg(["sum", "count"])
                    .reset_index()
                )
                monthly_data.columns = ["Month", "Total", "Transactions"]

                findings.append(f"\n**Monthly trend** ({len(monthly_data)} months of data):")
                for _, row in monthly_data.iterrows():
                    findings.append(
                        f"  • **{row['Month']}**: ${row['Total']:,.2f} ({int(row['Transactions'])} txns)"
                    )

                # Month-over-month change
                if len(monthly_data) >= 2:
                    last_month = monthly_data.iloc[-1]["Total"]
                    prev_month = monthly_data.iloc[-2]["Total"]
                    if prev_month != 0:
                        mom_change = ((last_month - prev_month) / abs(prev_month)) * 100
                        findings.append(f"  📊 Month-over-month change: **{mom_change:+.1f}%**")

            # Clean up temp column
            df.drop(columns=["_parsed_date"], inplace=True, errors="ignore")

        # Largest transactions
        top_n = df.nlargest(5, amount_col)
        findings.append("\n**Largest transactions:**")
        for _, row in top_n.iterrows():
            label_parts = []
            if category_col and category_col in df.columns:
                label_parts.append(str(row.get(category_col, "")))
            if date_col and date_col in df.columns:
                label_parts.append(str(row.get(date_col, "")))
            label = " | ".join(label_parts) if label_parts else f"Row"
            findings.append(f"  • {label}: **${row[amount_col]:,.2f}**")

        analysis = {
            "summary": f"Budget analysis of {len(df)} records.",
            "key_findings": findings,
            "statistics": stats,
            "category_breakdown": category_breakdown,
            "monthly_data": monthly_data,
        }

        return ToolResult(
            success=True,
            data=analysis,
            message="\n".join(findings),
            suggestions=[
                "Ask me to **chart spending by category**.",
                "Say **compare months** for trend analysis.",
                "Ask **where can I cut costs?** for savings tips.",
            ],
        )

    def find_savings_opportunities(
        self,
        df: pd.DataFrame,
        amount_col: str,
        category_col: Optional[str] = None,
    ) -> ToolResult:
        """Identify potential cost-saving opportunities."""
        df[amount_col] = pd.to_numeric(df[amount_col], errors="coerce")
        expenses = df[df[amount_col] < 0].copy() if (df[amount_col] < 0).any() else df.copy()

        tips: List[str] = []

        if category_col:
            cat_totals = expenses.groupby(category_col)[amount_col].agg(["sum", "count", "mean"])
            total_spending = abs(cat_totals["sum"].sum())

            # High-frequency small transactions
            for cat, row in cat_totals.iterrows():
                if row["count"] > 10 and abs(row["mean"]) < abs(total_spending) * 0.01:
                    tips.append(
                        f"**{cat}**: {int(row['count'])} small transactions (avg ${abs(row['mean']):,.2f}) — "
                        f"consider consolidating. Total: ${abs(row['sum']):,.2f}"
                    )

            # Largest category
            biggest = cat_totals["sum"].idxmin()  # most negative = most spending
            biggest_pct = abs(cat_totals.loc[biggest, "sum"]) / total_spending * 100
            if biggest_pct > 30:
                tips.append(
                    f"**{biggest}** accounts for **{biggest_pct:.0f}%** of spending. "
                    f"Even a 10% reduction saves ${abs(cat_totals.loc[biggest, 'sum']) * 0.1:,.2f}."
                )

        # Outlier spending
        mean_val = abs(expenses[amount_col].mean())
        std_val = expenses[amount_col].std()
        if std_val and not np.isnan(std_val):
            outliers = expenses[expenses[amount_col].abs() > mean_val + 2 * std_val]
            if len(outliers) > 0:
                tips.append(
                    f"Found **{len(outliers)} unusually large** transactions — review these for potential savings."
                )

        if not tips:
            tips.append("Your spending looks relatively even. No obvious quick wins detected.")

        return ToolResult(
            success=True,
            data=tips,
            message="### 💡 Savings Opportunities\n" + "\n".join(f"{i+1}. {t}" for i, t in enumerate(tips)),
        )

    def _find_col_by_role(self, profile, role: ColumnRole) -> Optional[str]:
        for col in profile.columns:
            if col.role == role:
                return col.name
        return None
```

