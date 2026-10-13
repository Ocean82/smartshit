import { Zap, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store/useStore'

/**
 * Cursor-style two-state segmented control for the chat apply posture.
 * 'Auto' fast-applies low-risk edits (with Undo); 'Preview' always waits for Apply.
 *
 * Reads/writes the store directly, so it can be dropped into any chat header
 * (dock or standalone) with no props. `variant` only tunes colors to sit on a
 * light dock header or the dark standalone ChatHeader gradient.
 */
export function ApplyPostureToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { applyPosture, setApplyPosture } = useStore(useShallow((s) => ({
    applyPosture: s.applyPosture,
    setApplyPosture: s.setApplyPosture,
  })))

  const groupClass = variant === 'dark' ? 'bg-white/15' : 'bg-gray-100'
  const activeClass = variant === 'dark'
    ? 'bg-white text-gray-900 shadow-sm'
    : 'bg-white text-gray-800 shadow-sm'
  const idleClass = variant === 'dark'
    ? 'text-blue-100 hover:text-white'
    : 'text-gray-400 hover:text-gray-600'

  const btn = (active: boolean) =>
    `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
      active ? activeClass : idleClass
    }`

  return (
    <div
      className={`inline-flex items-center rounded p-0.5 ${groupClass}`}
      role="group"
      aria-label="Apply posture"
    >
      <button
        type="button"
        onClick={() => setApplyPosture('auto')}
        className={btn(applyPosture === 'auto')}
        aria-pressed={applyPosture === 'auto'}
        title="Apply low-risk edits automatically"
      >
        <Zap size={11} aria-hidden="true" />
        <span className="hidden sm:inline">Auto</span>
      </button>
      <button
        type="button"
        onClick={() => setApplyPosture('preview')}
        className={btn(applyPosture === 'preview')}
        aria-pressed={applyPosture === 'preview'}
        title="Preview edits before applying"
      >
        <Search size={11} aria-hidden="true" />
        <span className="hidden sm:inline">Preview</span>
      </button>
    </div>
  )
}
