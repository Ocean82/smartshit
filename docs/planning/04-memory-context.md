# Memory: Conversation Context

> Conversation history, spreadsheet state, and context summaries.

> Source: [`docs/images/notes`](../images/notes)

## memory/context.py

```python
"""Conversation and spreadsheet context management."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from models import SpreadsheetState, ToolResult


@dataclass
class ConversationTurn:
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    tool_used: Optional[str] = None
    tool_result: Optional[ToolResult] = None


class ConversationContext:
    """Tracks the full conversation and spreadsheet state."""

    def __init__(self, max_history: int = 50):
        self.history: List[ConversationTurn] = []
        self.spreadsheet: SpreadsheetState = SpreadsheetState()
        self.max_history = max_history
        self.session_metadata: Dict[str, Any] = {}
        self._pending_questions: List[str] = []

    # ── History ──────────────────────────────────────────────────────

    def add_user_message(self, content: str):
        self.history.append(ConversationTurn(role="user", content=content))
        self._trim_history()

    def add_assistant_message(
        self,
        content: str,
        tool_used: Optional[str] = None,
        tool_result: Optional[ToolResult] = None,
    ):
        self.history.append(
            ConversationTurn(
                role="assistant",
                content=content,
                tool_used=tool_used,
                tool_result=tool_result,
            )
        )
        self._trim_history()

    def _trim_history(self):
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history :]

    # ── Pending questions for clarification ──────────────────────────

    def add_pending_question(self, question: str):
        self._pending_questions.append(question)

    def pop_pending_question(self) -> Optional[str]:
        return self._pending_questions.pop(0) if self._pending_questions else None

    @property
    def has_pending_questions(self) -> bool:
        return len(self._pending_questions) > 0

    # ── Summaries ────────────────────────────────────────────────────

    def get_context_summary(self) -> str:
        """Build a text summary of current context for the agent."""
        parts = []

        # Spreadsheet state
        if self.spreadsheet.is_loaded:
            parts.append(f"**Loaded file:** {self.spreadsheet.file_name}")
            parts.append(f"**Sheets:** {', '.join(self.spreadsheet.sheets.keys())}")
            parts.append(f"**Active sheet:** {self.spreadsheet.active_sheet}")
            if self.spreadsheet.active_sheet:
                profile = self.spreadsheet.profiles.get(self.spreadsheet.active_sheet)
                if profile:
                    parts.append(
                        f"**Dimensions:** {profile.row_count} rows × {profile.col_count} cols"
                    )
                    col_names = [c.name for c in profile.columns]
                    parts.append(f"**Columns:** {', '.join(col_names)}")
        else:
            parts.append("**No spreadsheet loaded.**")

        # Recent conversation (last 5 turns)
        recent = self.history[-5:]
        if recent:
            parts.append("\n**Recent conversation:**")
            for turn in recent:
                prefix = "User" if turn.role == "user" else "Assistant"
                snippet = turn.content[:120]
                parts.append(f"  {prefix}: {snippet}")

        return "\n".join(parts)

    def get_last_user_message(self) -> Optional[str]:
        for turn in reversed(self.history):
            if turn.role == "user":
                return turn.content
        return None
```

