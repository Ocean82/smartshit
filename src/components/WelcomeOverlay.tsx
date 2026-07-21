import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { MessageSquare, Zap, LayoutTemplate, ArrowRight, X } from 'lucide-react'

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="bg-white rounded-3xl shadow-2xl w-[520px] overflow-hidden">
        <div className="relative">
          <div className="absolute top-4 right-4">
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              onClick={dismiss}
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-10 pt-12 pb-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center mb-6">
              {current.icon}
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">{current.title}</h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">{current.description}</p>
          </div>

          <div className="flex justify-center gap-1.5 pb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6' : 'w-1.5 bg-gray-200'
                }`}
                style={i === step ? { background: 'var(--accent-500)' } : undefined}
              />
            ))}
          </div>

          <div className="px-8 pb-8 flex gap-3">
            {step > 0 && (
              <button
                type="button"
                className="flex-1 py-2.5 px-4 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
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
        </div>
      </div>
    </div>
  )
}
