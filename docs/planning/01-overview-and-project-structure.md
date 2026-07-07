# Overview and Project Structure

> High-level package layout for the Spreadsheet Brain system.

> Source: [`docs/images/notes`](../images/notes)

# Spreadsheet Brain - Agent Tools & Skills System

## Project Structure

```
spreadsheet_brain/
├── brain.py                 # Main brain orchestrator
├── tools/
│   ├── __init__.py
│   ├── reader.py            # Read & parse spreadsheets
│   ├── analyzer.py          # Analyze data patterns
│   ├── writer.py            # Write/modify spreadsheets
│   ├── formatter.py         # Format cells, sheets
│   ├── formula_engine.py    # Formula generation & evaluation
│   ├── chart_engine.py      # Chart/visualization generation
│   └── query_engine.py      # Natural language to spreadsheet queries
├── skills/
│   ├── __init__.py
│   ├── budget.py            # Budget-specific skills
│   ├── inventory.py         # Inventory tracking skills
│   ├── reporting.py         # Report generation skills
│   └── cleaning.py          # Data cleaning skills
├── memory/
│   ├── __init__.py
│   ├── context.py           # Conversation & spreadsheet context
│   └── sheet_state.py       # Current spreadsheet state tracking
├── chat/
│   ├── __init__.py
│   ├── intent_parser.py     # Understand what user wants
│   └── response_builder.py  # Build helpful responses
├── models.py                # Data models
├── config.py                # Configuration
└── requirements.txt
```

