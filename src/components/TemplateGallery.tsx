import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { LayoutTemplate, X, Search, ChevronRight } from 'lucide-react'
import { templates, templateCategories, getPopularTemplates, searchTemplates, type TemplateCategory } from '@/data/templates'

interface TemplateGalleryProps {
  open: boolean
  onClose: () => void
}

export function TemplateGallery({ open, onClose }: TemplateGalleryProps) {
  const { setChatInput, sendMessage } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'Popular' | 'All'>('Popular')

  if (!open) return null

  const displayTemplates = useMemo(() => {
    if (searchQuery) {
      return searchTemplates(searchQuery)
    }
    if (activeCategory === 'Popular') {
      return getPopularTemplates()
    }
    if (activeCategory === 'All') {
      return templates
    }
    return templates.filter(t => t.category === activeCategory)
  }, [searchQuery, activeCategory])

  function runTemplate(prompt: string) {
    setChatInput(prompt)
    onClose()
    setTimeout(() => sendMessage(), 50)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
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

        <p className="px-6 pt-4 text-sm text-gray-500 shrink-0">
          Pick something close to what you need. The assistant builds it for you — no formulas required.
        </p>

        {/* Search */}
        <div className="px-6 pt-3 shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-6 pt-3 pb-2 overflow-x-auto shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setActiveCategory('Popular'); setSearchQuery(''); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                activeCategory === 'Popular'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ⭐ Popular
            </button>
            <button
              type="button"
              onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                activeCategory === 'All'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({templates.length})
            </button>
            {templateCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Templates grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {displayTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No templates found</p>
              <p className="text-xs mt-1">Try a different search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => runTemplate(template.prompt)}
                  className="text-left rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">{template.icon}</span>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors mt-1" />
                  </div>
                  <p className="mt-2 font-semibold text-gray-900 text-sm">{template.name}</p>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{template.description}</p>
                  <p className="mt-2 text-[10px] text-blue-600 font-medium">{template.category}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-4 pt-2 border-t border-gray-100 shrink-0">
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
