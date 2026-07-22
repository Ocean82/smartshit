/**
 * EmptyGridGuide — Contextual "what now?" guidance shown over an empty grid.
 * Appears only when: welcome was dismissed, grid is empty, and user hasn't
 * interacted yet. Dismisses permanently on any action.
 */
import { useStore } from '@/store/useStore'
import { Upload, MessageSquare, LayoutTemplate } from 'lucide-react'

export function EmptyGridGuide({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const sheet = useStore((s) => s.getActiveSheet())
  const messages = useStore((s) => s.messages)
  const setActivePanel = useStore((s) => s.setActivePanel)

  // Only show when grid is truly empty and user hasn't started working
  const hasData = Object.keys(sheet.cells).length > 0
  const hasUserMessages = messages.some((m) => m.role === 'user')
  const welcomeDismissed = (() => {
    try { return !!localStorage.getItem('smartsht-welcome-dismissed') } catch { return false }
  })()

  if (!welcomeDismissed || hasData || hasUserMessages) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="pointer-events-auto max-w-sm text-center px-6">
        <p className="text-sm font-medium mb-4" style={{ color: 'var(--ink-secondary)' }}>
          Pick your starting point
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              document.querySelector<HTMLInputElement>('input[accept=".csv,.xlsx,.xls"]')?.click()
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-100)', color: 'var(--accent-600)' }}>
              <Upload size={16} />
            </div>
            <div>
              <span className="text-sm font-medium block" style={{ color: 'var(--ink-primary)' }}>Import a file</span>
              <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>CSV or Excel — the AI reads it instantly</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel('chat')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'oklch(0.93 0.04 155)', color: 'oklch(0.4 0.15 155)' }}>
              <MessageSquare size={16} />
            </div>
            <div>
              <span className="text-sm font-medium block" style={{ color: 'var(--ink-primary)' }}>Ask the assistant</span>
              <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>"Build a monthly budget" or "Track my expenses"</span>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenTemplates}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'oklch(0.93 0.04 290)', color: 'oklch(0.45 0.18 290)' }}>
              <LayoutTemplate size={16} />
            </div>
            <div>
              <span className="text-sm font-medium block" style={{ color: 'var(--ink-primary)' }}>Start from a template</span>
              <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Budget, invoice, expense report, and more</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
