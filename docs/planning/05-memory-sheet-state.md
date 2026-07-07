# Memory: Sheet State Manager

> Undo/redo snapshots for spreadsheet mutations.

> Source: [`docs/images/notes`](../images/notes)

## memory/sheet_state.py

```python
"""Spreadsheet state tracking with undo support."""

from __future__ import annotations

import copy
from typing import List, Optional

import pandas as pd

from models import SpreadsheetState


class SheetStateManager:
    """Manages spreadsheet state with undo/redo."""

    def __init__(self, max_undo: int = 20):
        self.max_undo = max_undo
        self._undo_stack: List[SpreadsheetState] = []
        self._redo_stack: List[SpreadsheetState] = []

    def save_state(self, state: SpreadsheetState):
        """Snapshot current state before a mutation."""
        snapshot = SpreadsheetState(
            file_path=state.file_path,
            file_name=state.file_name,
            sheets={name: df.copy() for name, df in state.sheets.items()},
            profiles=copy.deepcopy(state.profiles),
            active_sheet=state.active_sheet,
            loaded_at=state.loaded_at,
            modified=state.modified,
        )
        self._undo_stack.append(snapshot)
        if len(self._undo_stack) > self.max_undo:
            self._undo_stack.pop(0)
        self._redo_stack.clear()

    def undo(self, current: SpreadsheetState) -> Optional[SpreadsheetState]:
        if not self._undo_stack:
            return None
        self._redo_stack.append(current)
        return self._undo_stack.pop()

    def redo(self, current: SpreadsheetState) -> Optional[SpreadsheetState]:
        if not self._redo_stack:
            return None
        self._undo_stack.append(current)
        return self._redo_stack.pop()

    @property
    def can_undo(self) -> bool:
        return len(self._undo_stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0
```

