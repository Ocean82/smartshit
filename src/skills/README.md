# Vibe Excel Skills System

Skills are reusable "prompt + tool workflows" that the AI can discover, suggest, and execute.

## Structure

```
/skills
  /finance
    budget-generator.json
    invoice-template.json
    expense-report.json
  /business
    sales-forecast.json
    kpi-dashboard.json
  /data
    cleaning-pipeline.json
    analysis-template.json
  /hr
    employee-roster.json
```

## Skill Schema

```json
{
  "id": "budget-generator",
  "name": "Budget Generator",
  "category": "Finance",
  "description": "Create a comprehensive monthly budget template",
  "icon": "💰",
  "prompt": "Create a monthly budget template with income and expense categories",
  "tools": ["write_cell", "apply_formula", "format_cells"],
  "workflow": [
    {
      "step": 1,
      "tool": "write_cell",
      "params": { "cell": "A1", "value": "Monthly Budget" }
    }
  ]
}
```

## Usage

- Skills are loaded from `/src/data/skills.ts`
- The AI agent can discover and suggest skills based on context
- Users can create custom skills via the Skills panel
- Skills can be shared and imported
