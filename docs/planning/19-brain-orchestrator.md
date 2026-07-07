# Brain Orchestrator

> Main SpreadsheetBrain entry point and dispatch logic.

> Source: [`docs/images/notes`](../images/notes)

## brain.py — The Main Orchestrator

```python
"""
Spreadsheet Brain — the main orchestrator that ties tools, skills,
memory, and chat together into a single callable interface.

Usage:
    brain = SpreadsheetBrain()

    # Load a file
    result = brain.process("Here's my budget spreadsheet", file_path="budget.xlsx")
    # or
    result = brain.load_file("budget.xlsx")

    # Chat
    result = brain.process("Read and analyze my budget")
    result = brain.process("What's the total spending?")
    result = brain.process("Show me the top 5 expenses")
    result = brain.process("Chart spending by category")
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from chat.intent_parser import IntentParser
from chat.response_builder import ResponseBuilder
from config import DEFAULT_CONFIG, BrainConfig
from memory.context import ConversationContext
from memory.sheet_state import SheetStateManager
from models import IntentType, ToolResult, UserIntent
from skills.budget import BudgetSkill
from skills.cleaning import CleaningSkill
from skills.reporting import ReportingSkill
from tools.analyzer import SpreadsheetAnalyzer
from tools.chart_engine import ChartEngine
from tools.formatter import SpreadsheetFormatter
from tools.formula_engine import FormulaEngine
from tools.query_engine import QueryEngine
from tools.reader import SpreadsheetReader
from tools.writer import SpreadsheetWriter


class SpreadsheetBrain:
    """
    The brain your agent calls. It understands intent, picks the right
    tool/skill, executes it, and returns a chat-friendly response.
    """

    def __init__(self, config: BrainConfig = DEFAULT_CONFIG):
        self.config = config

        # Tools
        self.reader = SpreadsheetReader(config)
        self.analyzer = SpreadsheetAnalyzer(config)
        self.writer = SpreadsheetWriter()
        self.formatter = SpreadsheetFormatter()
        self.formula_engine = FormulaEngine()
        self.chart_engine = ChartEngine()
        self.query_engine = QueryEngine()

        # Skills
        self.budget_skill = BudgetSkill()
        self.cleaning_skill = CleaningSkill()
        self.reporting_skill = ReportingSkill()

        # Memory
        self.context = ConversationContext()
        self.state_manager = SheetStateManager()

        # Chat
        self.intent_parser = IntentParser()
        self.response_builder = ResponseBuilder()

        # Intent → handler dispatch
        self._handlers = {
            IntentType.READ: self._handle_read,
            IntentType.ANALYZE: self._handle_analyze,
            IntentType.WRITE: self._handle_write,
            IntentType.FORMAT: self._handle_format,
            IntentType.CREATE_CHART: self._handle_chart,
            IntentType.CREATE_FORMULA: self._handle_formula,
            IntentType.SUMMARIZE: self._handle_summarize,
            IntentType.FILTER: self._handle_filter,
            IntentType.SORT: self._handle_sort,
            IntentType.CLEAN: self._handle_clean,
            IntentType.BUDGET: self._handle_budget,
            IntentType.REPORT: self._handle_report,
            IntentType.COMPARE: self._handle_compare,
            IntentType.FIND: self._handle_find,
            IntentType.CALCULATE: self._handle_calculate,
            IntentType.EXPORT: self._handle_export,
            IntentType.CHAT: self._handle_chat,
            IntentType.UNKNOWN: self._handle_unknown,
        }

    # ═══════════════════════════════════════════════════════════════════
    #  PUBLIC API — what your agent calls
    # ═══════════════════════════════════════════════════════════════════

    def process(
        self,
        user_message: str,
        file_path: Optional[str] = None,
        file_bytes: Optional[bytes] = None,
        file_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point. Send user message + optional file.

        Returns:
            {
                "response": str,         # Chat message to show the user
                "data": Any,             # Structured data (DataFrame, dict, etc.)
                "suggestions": [str],    # Follow-up suggestions
                "intent": str,           # Detected intent
                "success": bool,
                "chart_config": dict,    # If a chart was created
                "preview": str,          # Table preview if applicable
            }
        """
        self.context.add_user_message(user_message)

        # ── Handle file upload ───────────────────────────────────────
        if file_path or file_bytes:
            load_result = self._load_file(file_path, file_bytes, file_name)
            if not load_result.success:
                return self._build_output(load_result, IntentType.READ)

        # ── Parse intent ─────────────────────────────────────────────
        intent = self.intent_parser.parse(user_message)

        # If intent needs data but none loaded, ask for it
        if (
            intent.intent_type
            not in (IntentType.CHAT, IntentType.UNKNOWN)
            and not self.context.spreadsheet.is_loaded
        ):
            result = ToolResult(
                success=False,
                message="No spreadsheet loaded yet. Please upload a file first!",
                suggestions=[
                    "Upload an Excel (.xlsx) or CSV file.",
                    "Say 'load my file' and attach it.",
                ],
            )
            return self._build_output(result, intent.intent_type)

        # ── Switch active sheet if specified ──────────────────────────
        if intent.target_sheet:
            sheets = self.context.spreadsheet.sheets
            if intent.target_sheet in sheets:
                self.context.spreadsheet.active_sheet = intent.target_sheet
            else:
                # Fuzzy match
                for name in sheets:
                    if intent.target_sheet.lower() in name.lower():
                        self.context.spreadsheet.active_sheet = name
                        break

        # ── Dispatch to handler ──────────────────────────────────────
        handler = self._handlers.get(intent.intent_type, self._handle_unknown)
        result = handler(intent)

        return self._build_output(result, intent.intent_type)

    def load_file(self, file_path: str) -> Dict[str, Any]:
        """Convenience: load a file directly."""
        return self.process("Load this file", file_path=file_path)

    def load_bytes(self, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Convenience: load from bytes (web upload)."""
        return self.process("Load this file", file_bytes=file_bytes, file_name=filename)

    def get_context_summary(self) -> str:
        """Get current context for the agent's system prompt."""
        return self.context.get_context_summary()

    def get_available_tools(self) -> List[str]:
        """List all available capabilities."""
        return [
            "read_spreadsheet", "analyze_data", "budget_analysis",
            "write_cells", "add_rows", "add_columns",
            "filter_data", "sort_data", "find_values",
            "create_chart", "create_formula", "calculate",
            "generate_report", "clean_data", "export",
            "summarize", "compare", "format_cells",
        ]

    def undo(self) -> Dict[str, Any]:
        """Undo last modification."""
        prev = self.state_manager.undo(self.context.spreadsheet)
        if prev:
            self.context.spreadsheet = prev
            return self._build_output(
                ToolResult(success=True, message="↩️ Undone."), IntentType.WRITE
            )
        return self._build_output(
            ToolResult(success=False, message="Nothing to undo."), IntentType.WRITE
        )

    def redo(self) -> Dict[str, Any]:
        """Redo last undone modification."""
        nxt = self.state_manager.redo(self.context.spreadsheet)
        if nxt:
            self.context.spreadsheet = nxt
            return self._build_output(
                ToolResult(success=True, message="↪️ Redone."), IntentType.WRITE
            )
        return self._build_output(
            ToolResult(success=False, message="Nothing to redo."), IntentType.WRITE
        )

    # ═══════════════════════════════════════════════════════════════════
    #  PRIVATE — File loading
    # ═══════════════════════════════════════════════════════════════════

    def _load_file(
        self,
        file_path: Optional[str],
        file_bytes: Optional[bytes],
        file_name: Optional[str],
    ) -> ToolResult:
        if file_bytes and file_name:
            result = self.reader.read_from_bytes(file_bytes, file_name)
        elif file_path:
            result = self.reader.read_file(file_path)
        else:
            return ToolResult(success=False, message="No file provided.")

        if result.success and result.data:
            self.context.spreadsheet = result.data
            # Auto-profile all sheets
            for name, df in self.context.spreadsheet.sheets.items():
                profile = self.analyzer.profile_sheet(df, name)
                self.context.spreadsheet.profiles[name] = profile

        return result

    # ═══════════════════════════════════════════════════════════════════
    #  PRIVATE — Intent handlers
    # ═══════════════════════════════════════════════════════════════════

    def _get_active_df(self) -> Optional[pd.DataFrame]:
        return self.context.spreadsheet.active_df

    def _save_before_modify(self):
        """Save state before any mutation."""
        self.state_manager.save_state(self.context.spreadsheet)

    def _update_active_df(self, df: pd.DataFrame):
        """Write modified df back to state."""
        sheet = self.context.spreadsheet.active_sheet
        if sheet:
            self.context.spreadsheet.sheets[sheet] = df
            self.context.spreadsheet.modified = True
            # Re-profile
            self.context.spreadsheet.profiles[sheet] = self.analyzer.profile_sheet(df, sheet)

    def _handle_read(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        n = intent.parameters.get("n", self.config.max_rows_preview)
        result = self.reader.get_preview(df, n)

        if result.success:
            preview = self.response_builder.format_dataframe_preview(
                result.data, max_rows=n, title=self.context.spreadsheet.active_sheet
            )
            result.message = preview

        return result

    def _handle_analyze(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        result = self.analyzer.analyze(
            df,
            sheet_name=self.context.spreadsheet.active_sheet or "Sheet1",
            focus_columns=intent.target_columns or None,
        )

        if result.success:
            analysis = result.data
            result.message = self.response_builder.format_analysis(analysis)

        return result

    def _handle_budget(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        return self.budget_skill.analyze_budget(df)

    def _handle_summarize(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        profile = self.context.spreadsheet.profiles.get(
            self.context.spreadsheet.active_sheet
        )
        if profile:
            return ToolResult(
                success=True,
                data=profile,
                message=self.response_builder.format_profile(profile),
                suggestions=["Ask me to **analyze** for deeper insights."],
            )

        return self.analyzer.analyze(df, sheet_name=self.context.spreadsheet.active_sheet or "Sheet1")

    def _handle_filter(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        filters = intent.filters
        if not filters and intent.target_columns:
            return ToolResult(
                success=False,
                message="I need to know what to filter by.",
                suggestions=[
                    'Try: "filter where Category == Food"',
                    'Try: "show rows where Amount > 100"',
                ],
            )

        # Try using query engine for natural language
        result = self.query_engine.execute_query(df, intent.raw_query)
        if result.success and isinstance(result.data, pd.DataFrame):
            preview = self.response_builder.format_dataframe_preview(result.data)
            result.message += "\n\n" + preview
        return result

    def _handle_sort(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        columns = intent.target_columns
        if not columns:
            # Try to extract from query
            for col in df.columns:
                if col.lower() in intent.raw_query.lower():
                    columns = [col]
                    break

        if not columns:
            return ToolResult(
                success=False,
                message="Which column should I sort by?",
                suggestions=[f"Available: {', '.join(df.columns.tolist())}"],
            )

        self._save_before_modify()
        ascending = intent.parameters.get("ascending", True)
        result = self.writer.sort_data(df, columns, ascending)
        if result.success:
            self._update_active_df(result.data)
            preview = self.response_builder.format_dataframe_preview(result.data)
            result.message += "\n\n" + preview
        return result

    def _handle_clean(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        self._save_before_modify()
        result = self.cleaning_skill.auto_clean(df)
        if result.success:
            self._update_active_df(result.data)
        return result

    def _handle_write(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        # Needs more context — ask user
        return ToolResult(
            success=True,
            message="What would you like to change?",
            suggestions=[
                'Say "set cell A5 to 100"',
                'Say "add a row with Name=John, Amount=500"',
                'Say "add a column called Total"',
                'Say "delete rows 5-10"',
            ],
        )

    def _handle_format(self, intent: UserIntent) -> ToolResult:
        return ToolResult(
            success=True,
            message="I can format your spreadsheet when exporting to Excel.",
            suggestions=[
                "Say **export with formatting** to create a styled Excel file.",
                f"Available styles: {', '.join(self.formatter.PRESET_STYLES.keys())}",
            ],
        )

    def _handle_chart(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        chart_type = intent.parameters.get("chart_type")
        x_col = intent.target_columns[0] if len(intent.target_columns) > 0 else None
        y_col = intent.target_columns[1] if len(intent.target_columns) > 1 else None

        if not chart_type and not x_col:
            # Auto-suggest
            return self.chart_engine.suggest_chart(df)

        if not chart_type:
            chart_type = "bar"

        # Auto-pick columns if not specified
        if not x_col:
            cat_cols = df.select_dtypes(include=["object", "category"]).columns
            x_col = cat_cols[0] if len(cat_cols) > 0 else None
        if not y_col:
            num_cols = df.select_dtypes(include="number").columns
            y_col = num_cols[0] if len(num_cols) > 0 else None

        return self.chart_engine.build_chart_config(
            df, chart_type, x_col=x_col, y_col=y_col
        )

    def _handle_formula(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        # If no specific formula requested, list templates
        return self.formula_engine.list_templates()

    def _handle_calculate(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        return self.query_engine.execute_query(df, intent.raw_query)

    def _handle_find(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        return self.query_engine.execute_query(df, intent.raw_query)

    def _handle_report(self, intent: UserIntent) -> ToolResult:
        df = self._get_active_df()
        if df is None:
            return ToolResult(success=False, message="No active sheet.")

        return self.reporting_skill.generate_summary_report(
            df, title=f"{self.context.spreadsheet.file_name} Report"
        )

    def _handle_compare(self, intent: UserIntent) -> ToolResult:
        sheets = self.context.spreadsheet.sheets
        if len(sheets) < 2:
            return ToolResult(
                success=False,
                message="Need at least 2 sheets to compare.",
                suggestions=["Upload a file with multiple sheets, or load a second file."],
            )

        names = list(sheets.keys())
        df1 = sheets[names[0]]
        df2 = sheets[names[1]]

        findings = [
            f'Comparing **"{names[0]}"** ({df1.shape[0]}×{df1.shape[1]}) vs **"{names[1]}"** ({df2.shape[0]}×{df2.shape[1]})',
        ]

        # Column differences
        cols1 = set(df1.columns)
        cols2 = set(df2.columns)
        common = cols1 & cols2
        only1 = cols1 - cols2
        only2 = cols2 - cols1

        findings.append(f"**Common columns:** {len(common)}")
        if only1:
            findings.append(f"**Only in {names[0]}:** {', '.join(only1)}")
        if only2:
            findings.append(f"**Only in {names[1]}:** {', '.join(only2)}")

        # Row count comparison
        findings.append(f"**Row counts:** {df1.shape[0]} vs {df2.shape[0]}")

        return ToolResult(
            success=True,
            data={"common_columns": list(common)},
            message="\n".join(findings),
        )

    def _handle_export(self, intent: UserIntent) -> ToolResult:
        fmt = intent.parameters.get("format", "xlsx")
        filename = self.context.spreadsheet.file_name or "export"
        from pathlib import Path
        stem = Path(filename).stem
        output_path = f"{stem}_export.{fmt}"

        return self.writer.export(
            self.context.spreadsheet.sheets, output_path, fmt
        )

    def _handle_chat(self, intent: UserIntent) -> ToolResult:
        """Handle general conversation / questions about capabilities."""
        msg = intent.raw_query.lower()

        if any(w in msg for w in ["help", "what can you do", "capabilities"]):
            return ToolResult(
                success=True,
                message="I can help you with spreadsheets! Here's what I can do:",
                suggestions=[
                    "📖 **Read & preview** spreadsheet data",
                    "📊 **Analyze** data — statistics, trends, patterns",
                    "💰 **Budget analysis** — income, expenses, categories",
                    "🧹 **Clean** data — duplicates, missing values, formatting",
                    "📈 **Charts** — bar, line, pie, scatter plots",
                    "🔢 **Formulas** — computed columns, aggregations",
                    "📋 **Reports** — summary reports, pivot tables",
                    "🔍 **Search & filter** — find specific data",
                    "📤 **Export** — save to Excel, CSV, JSON",
                    "↩️ **Undo/Redo** — revert changes",
                ],
            )

        if any(w in msg for w in ["hello", "hi", "hey"]):
            return ToolResult(
                success=True,
                message="Hello! 👋 I'm your spreadsheet assistant. Upload a file or ask me what I can do!",
            )

        return ToolResult(
            success=True,
            message="I'm here to help with your spreadsheets. Could you be more specific about what you need?",
            suggestions=[
                "Upload a spreadsheet file to get started.",
                "Say **help** to see what I can do.",
            ],
        )

    def _handle_unknown(self, intent: UserIntent) -> ToolResult:
        return ToolResult(
            success=False,
            message="I'm not sure what you're asking for.",
            suggestions=[
                "Try: 'analyze my data'",
                "Try: 'show me the first 10 rows'",
                "Try: 'what's the total of Amount?'",
                "Say **help** to see all capabilities.",
            ],
        )

    # ═══════════════════════════════════════════════════════════════════
    #  PRIVATE — Output formatting
    # ═══════════════════════════════════════════════════════════════════

    def _build_output(
        self, result: ToolResult, intent_type: IntentType
    ) -> Dict[str, Any]:
        """Build the final output dict."""
        output: Dict[str, Any] = {
            "response": result.message,
            "data": None,
            "suggestions": result.suggestions,
            "intent": intent_type.value,
            "success": result.success,
            "chart_config": None,
            "preview": None,
        }

        if result.data is not None:
            if isinstance(result.data, pd.DataFrame):
                output["data"] = result.data.to_dict(orient="records")
                output["preview"] = self.response_builder.format_dataframe_preview(
                    result.data
                )
            elif isinstance(result.data, dict) and "type" in result.data:
                # Chart config
                output["chart_config"] = result.data
            else:
                output["data"] = result.data

        # Store assistant response in context
        self.context.add_assistant_message(
            result.message, tool_used=intent_type.value, tool_result=result
        )

        return output
```

