import { useState } from 'react'
import { MessageSquare, Zap, LayoutTemplate, ArrowRight, X, Shield, Search } from 'lucide-react'

interface WelcomeOverlayProps {
  onOpenTemplates: () => void
}

export function WelcomeOverlay({ onOpenTemplates }: WelcomeOverlayProps) {
  const [isVisible, setIsVisible] = useState(() => {
    try {
      return !localStorage.getItem('smartsht-welcome-dismissed')
    } catch {
      return true
    }
  })
  const [step, setStep] = useState(0)

  if (!isVisible) return null

  const steps = [
    {
      icon: <img src="/smartsht-logo2.PNG" alt="smartsh!t" className="w-16 h-16 object-contain" />,
      title: 'Welcome to smartsh!t',
      description:
        'A spreadsheet that listens. Tell the assistant what you want to track — budgets, expenses, inventory — and it builds it for you.',
    },
    {
      icon: <Shield size={40} className="text-emerald-600" />,
      title: 'The Auditor catches mistakes others miss',
      description:
        'Import any spreadsheet and the Auditor instantly flags formula errors, skipped cells in SUMs, inconsistent columns, and outliers — before they cost you money.',
    },
    {
      icon: <MessageSquare size={40} className="text-blue-600" />,
      title: 'Chat first, formulas never',
      description:
        'Say things like "Build a monthly budget" or "Why am I overspending on food?" The assistant explains everything in plain English.',
    },
    {
      icon: <LayoutTemplate size={40} className="text-violet-600" />,
      title: 'Templates for real life',
      description:
        'Monthly budgets, expense reports, invoices, and sales trackers — one click to get started, then customize by chatting.',
    },
    {
      icon: <Zap size={40} className="text-amber-500" />,
      title: 'Preview before changes',
      description:
        'Every AI edit shows a preview first. You approve it, or reject it. Your data stays under your control.',
    },
  ]

  const current = steps[step]

  function dismiss() {
    try {
      localStorage.setItem('smartsht-welcome-dismissed', '1')
    } catch {
      // ignore
    }
    setIsVisible(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-[520px] max-w-full max-h-[min(92dvh,100%)] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="relative">
          <div className="absolute top-4 right-4">
            <button
              type="button"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--neutral-400)' }}
              onClick={dismiss}
              aria-label="Close welcome"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-10 pt-12 pb-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(to bottom right, var(--neutral-100), var(--accent-50))' }}>
              {current.icon}
            </div>
            <h2 id="welcome-title" className="text-xl font-bold mb-3" style={{ color: 'var(--ink-primary)' }}>{current.title}</h2>
            <p className="text-sm leading-relaxed max-w-sm" style={{ color: 'var(--ink-secondary)' }}>{current.description}</p>
          </div>

          <div className="flex justify-center gap-1.5 pb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6' : 'w-1.5'
                }`}
                style={i === step ? { background: 'var(--accent-500)' } : { background: 'var(--neutral-200)' }}
              />
            ))}
          </div>

          <div className="px-8 pb-6 flex gap-3">
            {step > 0 && (
              <button
                type="button"
                className="flex-1 py-2.5 px-4 text-sm border rounded-xl transition-colors"
                style={{ color: 'var(--ink-secondary)', borderColor: 'var(--neutral-200)' }}
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                type="button"
                className="flex-1 py-2.5 px-4 text-sm text-white rounded-xl transition-colors flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent-600)' }}
                onClick={() => setStep(step + 1)}
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="flex-1 py-2.5 px-4 text-sm text-white rounded-xl transition-colors flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent-600)' }}
                onClick={() => {
                  dismiss()
                  onOpenTemplates()
                }}
              >
                Pick a template
              </button>
            )}
          </div>

          {/* Keyboard shortcut hint — always visible at bottom */}
          <div className="px-8 pb-6 flex items-center justify-center">
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <Search size={11} />
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono border" style={{ background: 'var(--neutral-100)', color: 'var(--ink-secondary)', borderColor: 'var(--neutral-200)' }}>Ctrl+K</kbd>
              <span>anytime for commands</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
