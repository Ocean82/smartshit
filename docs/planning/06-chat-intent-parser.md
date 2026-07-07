# Chat: Intent Parser

> Natural-language to structured UserIntent routing.

> Source: [`docs/images/notes`](../images/notes)

## chat/intent_parser.py

```python
"""Parse user natural language into structured intents."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from models import IntentType, UserIntent


# ── Keyword maps ─────────────────────────────────────────────────────────

_INTENT_KEYWORDS: Dict[IntentType, List[str]] = {
    IntentType.READ: [
        "read", "open", "load", "show", "display", "view", "see",
        "what's in", "look at", "preview", "print",
    ],
    IntentType.ANALYZE: [
        "analyze", "analysis", "insights", "patterns", "statistics",
        "stats", "breakdown", "understand", "examine", "evaluate",
        "trend", "trends", "overview",
    ],
    IntentType.WRITE: [
        "write", "add", "insert", "update", "change", "modify",
        "set", "put", "enter", "edit", "replace",
    ],
    IntentType.FORMAT: [
        "format", "style", "bold", "color", "highlight", "font",
        "border", "align", "width", "merge",
    ],
    IntentType.CREATE_CHART: [
        "chart", "graph", "plot", "visualize", "visualization",
        "pie chart", "bar chart", "line chart", "histogram",
    ],
    IntentType.CREATE_FORMULA: [
        "formula", "equation", "calculate column", "computed",
        "vlookup", "sumif", "countif",
    ],
    IntentType.SUMMARIZE: [
        "summarize", "summary", "total", "totals", "sum up",
        "overview", "high level", "quick look", "brief",
    ],
    IntentType.FILTER: [
        "filter", "where", "only show", "rows where", "exclude",
        "include only", "greater than", "less than", "between",
    ],
    IntentType.SORT: [
        "sort", "order", "rank", "arrange", "ascending",
        "descending", "top", "bottom", "highest", "lowest",
    ],
    IntentType.CLEAN: [
        "clean", "fix", "remove duplicates", "fill missing",
        "trim", "deduplicate", "normalize", "standardize",
    ],
    IntentType.BUDGET: [
        "budget", "spending", "expenses", "income", "savings",
        "cost", "revenue", "profit", "loss", "financial",
        "money", "cash flow",
    ],
    IntentType.REPORT: [
        "report", "generate report", "export report",
        "monthly report", "weekly report",
    ],
    IntentType.COMPARE: [
        "compare", "difference", "vs", "versus", "against",
        "changed", "comparison",
    ],
    IntentType.FIND: [
        "find", "search", "look for", "locate", "which",
        "where is", "contains",
    ],
    IntentType.CALCULATE: [
        "calculate", "compute", "how much", "what is the total",
        "average", "sum", "count", "max", "min", "median",
    ],
    IntentType.EXPORT: [
        "export", "save as", "download", "convert",
    ],
}


class IntentParser:
    """Parses natural language into UserIntent objects."""

    def __init__(self):
        # Pre-compile patterns
        self._column_pattern = re.compile(
            r'column\s+"([^"]+)"'
            r'|column\s+(\w+)'
            r'|"([^"]+)"\s+column'
            r"|the\s+(\w+)\s+column",
            re.IGNORECASE,
        )
        self._sheet_pattern = re.compile(
            r'sheet\s+"([^"]+)"'
            r'|sheet\s+(\w+)'
            r'|tab\s+"([^"]+)"'
            r"|tab\s+(\w+)",
            re.IGNORECASE,
        )
        self._range_pattern = re.compile(
            r"rows?\s+(\d+)\s*(?:to|-|through)\s*(\d+)", re.IGNORECASE
        )

    def parse(self, user_message: str) -> UserIntent:
        """Parse a user message into a UserIntent."""
        lower = user_message.lower().strip()

        # Score each intent type
        scores: Dict[IntentType, float] = {}
        for intent_type, keywords in _INTENT_KEYWORDS.items():
            score = 0.0
            for kw in keywords:
                if kw in lower:
                    # Longer keyword matches are worth more
                    score += len(kw.split())
            scores[intent_type] = score

        # Pick best
        best_intent = max(scores, key=scores.get)  # type: ignore[arg-type]
        best_score = scores[best_intent]

        if best_score == 0:
            best_intent = IntentType.CHAT
            confidence = 0.3
        else:
            total = sum(scores.values())
            confidence = best_score / total if total else 0.0

        # Handle compound intents like "read and analyze my budget"
        if best_intent == IntentType.READ and scores.get(IntentType.ANALYZE, 0) > 0:
            best_intent = IntentType.ANALYZE
            confidence = min(confidence + 0.2, 1.0)

        # If budget keywords appear, promote to BUDGET
        if (
            scores.get(IntentType.BUDGET, 0) > 0
            and best_intent in (IntentType.READ, IntentType.ANALYZE, IntentType.SUMMARIZE)
        ):
            best_intent = IntentType.BUDGET

        # Extract targets
        target_columns = self._extract_columns(user_message)
        target_sheet = self._extract_sheet(user_message)
        target_rows = self._extract_rows(user_message)
        parameters = self._extract_parameters(user_message, best_intent)

        return UserIntent(
            intent_type=best_intent,
            target_sheet=target_sheet,
            target_columns=target_columns,
            target_rows=target_rows,
            parameters=parameters,
            raw_query=user_message,
            confidence=round(confidence, 2),
        )

    # ── Extraction helpers ───────────────────────────────────────────

    def _extract_columns(self, text: str) -> List[str]:
        matches = self._column_pattern.findall(text)
        columns = []
        for match_groups in matches:
            for g in match_groups:
                if g:
                    columns.append(g.strip())
        return columns

    def _extract_sheet(self, text: str) -> Optional[str]:
        match = self._sheet_pattern.search(text)
        if match:
            for g in match.groups():
                if g:
                    return g.strip()
        return None

    def _extract_rows(self, text: str) -> Optional[str]:
        match = self._range_pattern.search(text)
        if match:
            return f"{match.group(1)}-{match.group(2)}"
        if "all" in text.lower():
            return "all"
        return None

    def _extract_parameters(
        self, text: str, intent: IntentType
    ) -> Dict[str, any]:
        params: Dict[str, any] = {}
        lower = text.lower()

        # Sort direction
        if intent == IntentType.SORT:
            if any(w in lower for w in ["descending", "desc", "highest", "top", "largest"]):
                params["ascending"] = False
            else:
                params["ascending"] = True

        # Top/bottom N
        n_match = re.search(r"(?:top|bottom|first|last)\s+(\d+)", lower)
        if n_match:
            params["n"] = int(n_match.group(1))
            params["position"] = (
                "top" if any(w in lower for w in ["top", "first", "highest"]) else "bottom"
            )

        # Chart type
        if intent == IntentType.CREATE_CHART:
            for chart_type in ["bar", "line", "pie", "scatter", "histogram", "area"]:
                if chart_type in lower:
                    params["chart_type"] = chart_type
                    break

        # Export format
        if intent == IntentType.EXPORT:
            for fmt in ["csv", "xlsx", "json", "pdf", "html"]:
                if fmt in lower:
                    params["format"] = fmt
                    break

        return params
```

