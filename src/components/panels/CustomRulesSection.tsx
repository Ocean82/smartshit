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
    const columnExists = columns.some((c) => c.letter === rule.column)
    setColumn(columnExists ? rule.column : (columns[0]?.letter ?? 'A'))
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
    if (numericOp && !Number.isFinite(Number(value))) return
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
      <div className="flex items-center px-3 py-2.5 hover:bg-slate-50 transition-colors">
        <button
          type="button"
          className="flex-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Custom Rules
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px]">
            {enabledCount}
          </span>
        </button>
        <button
          type="button"
          aria-label="Add rule"
          className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          onClick={() => {
            resetForm()
            setShowForm(true)
            setOpen(true)
          }}
        >
          <Plus size={13} />
        </button>
      </div>

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
                  disabled={needsValue && (value.trim() === '' || (numericOp && !Number.isFinite(Number(value))))}
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
