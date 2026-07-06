import { useStore } from '@/store/useStore'
import { defaultSkills } from '@/data/skills'
import { LayoutTemplate, X } from 'lucide-react'

interface TemplateGalleryProps {
  open: boolean
  onClose: () => void
}

const STARTER_TEMPLATES = defaultSkills.filter((s) =>
  ['budget-generator', 'expense-report', 'sales-tracker', 'invoice-template', 'project-tracker'].includes(s.id),
)

export function TemplateGallery({ open, onClose }: TemplateGalleryProps) {
  const { setChatInput, sendMessage } = useStore()

  if (!open) return null

  function runTemplate(prompt: string) {
    setChatInput(prompt)
    onClose()
    setTimeout(() => sendMessage(), 50)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Start with a template</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <p className="px-6 pt-4 text-sm text-gray-500">
          Pick something close to what you need. The assistant builds it for you — no formulas required.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-6">
          {STARTER_TEMPLATES.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => runTemplate(skill.prompt)}
              className="text-left rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all"
            >
              <span className="text-2xl">{skill.icon}</span>
              <p className="mt-2 font-semibold text-gray-900">{skill.name}</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{skill.description}</p>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Start blank instead
          </button>
        </div>
      </div>
    </div>
  )
}
