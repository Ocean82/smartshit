### Task 4: Custom Rules UI in the Auditor panel

**Files:**
- Create: `src/components/panels/CustomRulesSection.tsx`
- Modify: `src/components/panels/AuditPanelContent.tsx`

**Interfaces:**
- Consumes: `loadCustomRules`/`saveCustomRules`/`OPERATOR_LABELS` and types `CustomAuditRule`/`CustomRuleOperator` from `@/auditor/customRules`; `Severity` from `@/auditor/types`; `refToCell`/`letterToCol` from `@/engine/spreadsheet`; `SheetData` from `@/types`.
- Produces: `<CustomRulesSection sheet={SheetData} onRulesChanged={() => void} />`. Calling `onRulesChanged()` after any rule add/edit/toggle/delete; the panel re-runs the audit with the updated rules.

- [ ] **Step 1: Create the component**

Create `src/components/panels/CustomRulesSection.tsx`:

```tsx
/**
 * CustomRulesSection — manages user-defined audit rules.
 * Renders inside the Auditor panel above the findings list.
 */

import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Eye, EyeOff, ChevronDown, ChevronRight, X } from 'lucide-react'
import { loadCustomRules, saveCustomRules, OPERATOR_LABELS } from '@/auditor/customRules'
import type { CustomAuditRule, CustomRuleOperator } from '@/auditor/customRules'
import type { Severity } from '@/auditor/types'
import { refToCell, letterToCol } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'

const OPERATORS: CustomRuleOperator[] = [
  'gt', 'lt', 'gte', 'lte', 'eq', 'neq',
  'contains', 'notContains', 'isEmpty', 'isNotEmpty',
]
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const NUMERIC_OPERATORS = new Set<CustomRuleOperator>(['gt', 'lt', 'gte', 'lte', 'eq', 'neq'])
const VALUE_OPERATORS = new Set<CustomRuleOperator>(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'contains', 'notContains'])

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface CustomRulesSectionProps {
  sheet: SheetData
  onRulesChanged: () => void
}

export function CustomRulesSection({ sheet, onRulesChanged }: CustomRulesSectionProps) {
  const [rules, setRules] = useState<CustomAuditRule[]>(() => loadCustomRules())
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomAuditRule | null>(null)
  const [name, setName] = useState('')
  const [column, setColumn] = useState('A')
  const [operator, setOperator] = useState<CustomRuleOperator>('gt')
  const [value, setValue] = useState('')
  const [severity, setSeverity] = useState<Severity>('high')

  const columns = useMemo(() => {
    const list: Array<{ letter: string; label: string }> = []
    const seen = new Set<number>()
    for (const cellId of Object.keys(sheet.cells)) {
      const m = cellId.match(/^([A-Za-z]{1,3})\d+$/)
      if (!m) continue
      const col = letterToCol(m[1])
      if (seen.has(col)) continue
      seen.add(col)
      const header = sheet.cells[refToCell(0, col)]?.value
      const headerText = typeof header === 'string' && header.trim() ? header.trim() : null
      list.push({
        letter: m[1].toUpperCase(),
        label: headerText ? `${m[1].toUpperCase()} — ${headerText}` : m[1].toUpperCase(),
      })
    }
    return list.sort((a, b) => letterToCol(a.letter) - letterToCol(b.letter))
  }, [sheet])

  const persist = (next: CustomAuditRule[]) => {
    setRules(next)
    saveCustomRules(next)
    onRulesChanged()
  }

  const toggle = (id: string) => {
    persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const remove = (id: string) => {
    persist(rules.filter((r) => r.id !== id))
  }

  const startEdit = (rule: CustomAuditRule) => {
    setEditing(rule)
    setName(rule.name)
    setColumn(rule.column)
    setOperator(rule.operator)
    setSeverity(rule.severity)
    setValue(rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty' ? '' : String(rule.value))
    setShowForm(true)
  }

  const resetForm = () => {
    setEditing(null)
    setName('')
    setColumn('A')
    setOperator('gt')
    setValue('')
    setSeverity('high')
    setShowForm(false)
  }

  const needsValue = VALUE_OPERATORS.has(operator)
  const numericOp = NUMERIC_OPERATORS.has(operator)

  const handleSubmit = () => {
    if (needsValue && value.trim() === '') return
    const rule: CustomAuditRule = {
      id: editing?.id ?? newId(),
      name: name.trim() || 'Untitled rule',
      column,
      operator,
      value: !needsValue ? '' : numericOp ? Number(value) : value,
      severity,
      enabled: editing?.enabled ?? true,
    }
    const next = editing ? rules.map((r) => (r.id === editing.id ? rule : r)) : [...rules, rule]
    persist(next)
    resetForm()
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="border-b border-slate-100 bg-white/60">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Custom Rules
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px]">
            {enabledCount}
          </span>
        </span>
        <Plus
          size={13}
          className="text-slate-400 hover:text-blue-600"
          onClick={(e) => {
            e.stopPropagation()
            resetForm()
            setShowForm(true)
            setOpen(true)
          }}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {showForm && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                  {editing ? 'Edit Rule' : 'New Rule'}
                </span>
                <button type="button" className="text-slate-400 hover:text-slate-600" onClick={resetForm} aria-label="Close">
                  <X size={13} />
                </button>
              </div>

              <input
                className="w-full px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                placeholder="Rule name (e.g. Large expense)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                >
                  {columns.length === 0 && <option value="A">A</option>}
                  {columns.map((c) => (
                    <option key={c.letter} value={c.letter}>{c.label}</option>
                  ))}
                </select>

                <select
                  className="px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as CustomRuleOperator)}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                  ))}
                </select>
              </div>

              {needsValue && (
                <input
                  className="w-full px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  placeholder={numericOp ? 'Threshold (e.g. 5000)' : 'Text'}
                  type={numericOp ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}

              <div className="flex items-center gap-2">
                <select
                  className="flex-1 px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  {SEVERITIES.map((sev) => (
                    <option key={sev} value={sev}>{sev}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-40"
                  disabled={needsValue && value.trim() === ''}
                  onClick={handleSubmit}
                >
                  {editing ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {rules.length === 0 && !showForm && (
            <p className="text-[10px] text-slate-400 px-1">
              No custom rules. Add one to flag domain-specific issues (e.g. expenses over a threshold).
            </p>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <button
                type="button"
                title={rule.enabled ? 'Enabled' : 'Disabled'}
                className={`p-1 rounded-md ${rule.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
                onClick={() => toggle(rule.id)}
              >
                {rule.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 truncate">{rule.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {rule.column} {OPERATOR_LABELS[rule.operator]}
                  {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' ? ` ${String(rule.value)}` : ''} · {rule.severity}
                </p>
              </div>
              <button type="button" className="p-1 text-slate-400 hover:text-blue-600" title="Edit" onClick={() => startEdit(rule)}>
                <Pencil size={12} />
              </button>
              <button type="button" className="p-1 text-slate-400 hover:text-rose-600" title="Delete" onClick={() => remove(rule.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the section into AuditPanelContent**

In `src/components/panels/AuditPanelContent.tsx`:

Add imports after the existing imports:

```tsx
import { loadCustomRules } from '@/auditor/customRules'
import { CustomRulesSection } from './CustomRulesSection'
```

Add state after `const [filter, setFilter] = ...`:

```tsx
  const [ruleVersion, setRuleVersion] = useState(0)
```

Change `handleRunAudit` (lines 24-37) to pass custom rules and depend on `ruleVersion`:

```tsx
  const handleRunAudit = useCallback(() => {
    if (!activeSheet) return
    setLoading(true)
    requestAnimationFrame(() => {
      try {
        const auditResult = runAudit(activeSheet, getComputedValue, loadCustomRules())
        setResult(auditResult)
      } catch (err) {
        console.error('Audit failed:', err)
      } finally {
        setLoading(false)
      }
    })
  }, [activeSheet, getComputedValue, ruleVersion])
```

Replace the auto-run effect (lines 40-44):

```tsx
  // Auto-run on first open and whenever custom rules change
  useEffect(() => {
    if (activeSheet && Object.keys(activeSheet.cells).length > 0) {
      handleRunAudit()
    }
  }, [handleRunAudit])
```

(Remove the `// eslint-disable-line react-hooks/exhaustive-deps` comment.)

Insert the section render just before the findings list div (before `<div className="flex-1 overflow-y-auto ...">`):

```tsx
      {activeSheet && (
        <CustomRulesSection
          sheet={activeSheet}
          onRulesChanged={() => setRuleVersion((v) => v + 1)}
        />
      )}
```

- [ ] **Step 3: Verify everything passes**

Run: `npx eslint src`
Expected: no errors, no warnings.

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all tests pass (custom rules tests + integration tests + the full suite).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/CustomRulesSection.tsx src/components/panels/AuditPanelContent.tsx
git commit -m "feat(audit): custom rules manager UI in the auditor panel"
```

---

## Verification Checklist (final gate)

- [ ] `npx eslint src` → 0 errors / 0 warnings
- [ ] `npx tsc --noEmit` → clean
- [ ] `npx vitest run` → 397+ tests pass (existing suite + new custom-rules tests + 2 new integration tests)
- [ ] Manual smoke check (if dev server available): Auditor panel shows Custom Rules section; adding a `B > 5000` rule flags matching rows; magic-number finding shows APPLY FIX and writes the constant to the right-side cell; #DIV/0! finding still fixes via IFERROR.
