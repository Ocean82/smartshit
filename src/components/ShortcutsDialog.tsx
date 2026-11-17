import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Editing',
    items: [
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
      ['Ctrl+C / X / V', 'Copy / cut / paste'],
      ['F2 or Enter', 'Edit the active cell'],
      ['Delete', 'Clear selected cells'],
      ['Ctrl+B / I', 'Bold / italic'],
    ],
  },
  {
    group: 'Navigation',
    items: [
      ['Arrow keys', 'Move one cell'],
      ['Ctrl+Arrow', 'Jump to the edge of the data'],
      ['Shift+Arrow', 'Extend the selection'],
      ['Ctrl+Home', 'Go to A1'],
      ['Ctrl+A', 'Select all'],
      ['Shift+F10 / Menu key', 'Open the cell context menu'],
    ],
  },
  {
    group: 'Tools',
    items: [
      ['Ctrl+F / Ctrl+H', 'Find and replace'],
      ['Ctrl+K', 'Command palette'],
      ['Ctrl+/', 'Show this list'],
    ],
  },
]

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useFocusTrap<HTMLDivElement>(open, close)
  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('smartsht:show-shortcuts', show)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('smartsht:show-shortcuts', show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={close} role="presentation">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border p-5 shadow-2xl"
        style={{ background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="shortcuts-title" data-focus-on-open tabIndex={-1} className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={close} className="p-2.5 rounded-lg" style={{ color: 'var(--neutral-400)' }} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        {SHORTCUTS.map((g) => (
          <section key={g.group} className="mb-3">
            <h3 className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--neutral-500)' }}>{g.group}</h3>
            <dl>
              {g.items.map(([keys, what]) => (
                <div key={keys} className="flex justify-between gap-4 py-1 text-xs border-b" style={{ borderColor: 'var(--neutral-100)' }}>
                  <dt className="font-mono" style={{ color: 'var(--ink-primary)' }}>{keys}</dt>
                  <dd style={{ color: 'var(--ink-secondary)' }}>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
