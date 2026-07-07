# Data Models

> Enums and dataclasses shared across tools, skills, and memory.

> Source: [`docs/images/notes`](../images/notes)

## models.py

```python
"""Data models used across the spreadsheet brain."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Union

import pandas as pd


# ── Enums ────────────────────────────────────────────────────────────────

class CellType(Enum):
    TEXT = auto()
    NUMBER = auto()
    DATE = auto()
    BOOLEAN = auto()
    FORMULA = auto()
    EMPTY = auto()
    CURRENCY = auto()
    PERCENTAGE = auto()


class IntentType(Enum):
    READ = "read"
    ANALYZE = "analyze"
    WRITE = "write"
    FORMAT = "format"
    CREATE_CHART = "create_chart"
    CREATE_FORMULA = "create_formula"
    SUMMARIZE = "summarize"
    FILTER = "filter"
    SORT = "sort"
    CLEAN = "clean"
    BUDGET = "budget"
    REPORT = "report"
    COMPARE = "compare"
    FIND = "find"
    CALCULATE = "calculate"
    EXPORT = "export"
    CHAT = "chat"
    UNKNOWN = "unknown"


class ColumnRole(Enum):
    """Semantic role of a column."""
    DATE = "date"
    CATEGORY = "category"
    AMOUNT = "amount"
    QUANTITY = "quantity"
    LABEL = "label"
    ID = "id"
    PERCENTAGE = "percentage"
    DESCRIPTION = "description"
    UNKNOWN = "unknown"


# ── Data Classes ─────────────────────────────────────────────────────────

@dataclass
class CellInfo:
    row: int
    col: int
    value: Any
    cell_type: CellType
    formula: Optional[str] = None
    format: Optional[str] = None


@dataclass
class ColumnProfile:
    """Profile of a single column."""
    name: str
    dtype: str
    role: ColumnRole
    non_null_count: int
    null_count: int
    unique_count: int
    sample_values: list = field(default_factory=list)
    # Numeric stats
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    median_val: Optional[float] = None
    std_val: Optional[float] = None
    sum_val: Optional[float] = None


@dataclass
class SheetProfile:
    """Full profile of a worksheet."""
    name: str
    row_count: int
    col_count: int
    columns: List[ColumnProfile]
    detected_purpose: Optional[str] = None
    has_headers: bool = True
    has_totals_row: bool = False
    date_range: Optional[tuple] = None


@dataclass
class SpreadsheetState:
    """Current state of the loaded spreadsheet."""
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    sheets: Dict[str, pd.DataFrame] = field(default_factory=dict)
    profiles: Dict[str, SheetProfile] = field(default_factory=dict)
    active_sheet: Optional[str] = None
    loaded_at: Optional[datetime] = None
    modified: bool = False

    @property
    def is_loaded(self) -> bool:
        return len(self.sheets) > 0

    @property
    def active_df(self) -> Optional[pd.DataFrame]:
        if self.active_sheet and self.active_sheet in self.sheets:
            return self.sheets[self.active_sheet]
        return None


@dataclass
class UserIntent:
    """Parsed user intent."""
    intent_type: IntentType
    target_sheet: Optional[str] = None
    target_columns: List[str] = field(default_factory=list)
    target_rows: Optional[str] = None  # e.g., "1-10", "all"
    filters: Dict[str, Any] = field(default_factory=dict)
    parameters: Dict[str, Any] = field(default_factory=dict)
    raw_query: str = ""
    confidence: float = 0.0


@dataclass
class ToolResult:
    """Standard result from any tool."""
    success: bool
    data: Any = None
    message: str = ""
    suggestions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_chat_response(self) -> str:
        """Format as a chat-friendly response."""
        parts = []
        if self.message:
            parts.append(self.message)
        if self.suggestions:
            parts.append("\n**Suggestions:**")
            for s in self.suggestions:
                parts.append(f"  • {s}")
        return "\n".join(parts)
```

