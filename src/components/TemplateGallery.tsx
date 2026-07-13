import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { LayoutTemplate, X, Search, ChevronRight, Upload, Download, Star, Globe, Loader2, Send } from 'lucide-react'
import { templates, templateCategories, getPopularTemplates, searchTemplates, type TemplateCategory } from '@/data/templates'
import { loadCommunityTemplates, importTemplateFromFile, installTemplate, type CommunityTemplate, type TemplatePackage } from '@/lib/communityTemplates'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

interface CloudTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  prompt: string
  downloads: number
  rating: number | null
  ratingCount: number
  author: string
  createdAt: string
}

interface TemplateGalleryProps {
  open: boolean
  onClose: () => void
}

export function TemplateGallery({ open, onClose }: TemplateGalleryProps) {
  const { setChatInput, sendMessage } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'Popular' | 'All' | 'Community' | 'Marketplace'>('Popular')
  const [communityTemplates, setCommunityTemplates] = useState<CommunityTemplate[]>(loadCommunityTemplates)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Marketplace state
  const [cloudTemplates, setCloudTemplates] = useState<CloudTemplate[]>([])
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudSort, setCloudSort] = useState<'popular' | 'recent' | 'rating'>('popular')
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [showPublish, setShowPublish] = useState(false)

  useEffect(() => {
    if (activeCategory === 'Marketplace' && open) {
      fetchCloudTemplates()
    }
  }, [activeCategory, cloudSort, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchCloudTemplates() {
    setCloudLoading(true)
    try {
      const params = new URLSearchParams({ sort: cloudSort, limit: '50' })
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`${API_BASE}/api/community-templates?${params}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const json = (await res.json()) as { templates: CloudTemplate[]; total: number }
        setCloudTemplates(json.templates)
      }
    } catch { /* offline */ }
    setCloudLoading(false)
  }

  if (!open) return null

  const allTemplates = [...templates, ...communityTemplates]

  const displayTemplates = useMemo(() => {
    if (activeCategory === 'Marketplace') return []
    if (searchQuery) {
      const builtin = searchTemplates(searchQuery)
      const community = communityTemplates.filter((t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
      return [...builtin, ...community]
    }
    if (activeCategory === 'Popular') return getPopularTemplates()
    if (activeCategory === 'All') return allTemplates
    if (activeCategory === 'Community') return communityTemplates
    return allTemplates.filter(t => t.category === activeCategory)
  }, [searchQuery, activeCategory, communityTemplates])

  function runTemplate(prompt: string) {
    setChatInput(prompt)
    onClose()
    setTimeout(() => sendMessage(), 50)
  }

  async function handleInstallCloud(template: CloudTemplate) {
    setInstallingId(template.id)
    try {
      const res = await fetch(`${API_BASE}/api/community-templates/${template.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const json = (await res.json()) as { template: { name: string; description: string; category: string; icon: string; prompt: string } }
        const pkg: TemplatePackage = {
          version: 1,
          type: 'smartsht-template',
          template: { ...json.template, author: template.author },
        }
        installTemplate(pkg)
        setCommunityTemplates(loadCommunityTemplates())
      }
    } catch { /* ignore */ }
    setInstallingId(null)
  }

  async function handleImportTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importTemplateFromFile(file)
    if (result) {
      setCommunityTemplates(loadCommunityTemplates())
      setActiveCategory('Community')
    }
    if (importInputRef.current) importInputRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Start with a template</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
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
              placeholder={activeCategory === 'Marketplace' ? 'Search community templates...' : 'Search templates...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && activeCategory === 'Marketplace') fetchCloudTemplates() }}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-6 pt-3 pb-2 overflow-x-auto shrink-0">
          <div className="flex gap-2">
            <TabButton active={activeCategory === 'Popular'} onClick={() => { setActiveCategory('Popular'); setSearchQuery('') }}>⭐ Popular</TabButton>
            <TabButton active={activeCategory === 'Marketplace'} onClick={() => { setActiveCategory('Marketplace'); setSearchQuery('') }} variant="emerald">🌍 Marketplace</TabButton>
            <TabButton active={activeCategory === 'All'} onClick={() => { setActiveCategory('All'); setSearchQuery('') }}>All ({allTemplates.length})</TabButton>
            {communityTemplates.length > 0 && (
              <TabButton active={activeCategory === 'Community'} onClick={() => { setActiveCategory('Community'); setSearchQuery('') }} variant="violet">👥 My Community ({communityTemplates.length})</TabButton>
            )}
            {templateCategories.map((cat) => (
              <TabButton key={cat} active={activeCategory === cat} onClick={() => { setActiveCategory(cat); setSearchQuery('') }}>{cat}</TabButton>
            ))}
          </div>
        </div>

        {/* Templates grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeCategory === 'Marketplace' ? (
            <MarketplaceGrid
              templates={cloudTemplates}
              loading={cloudLoading}
              sort={cloudSort}
              onSortChange={setCloudSort}
              installingId={installingId}
              onInstall={handleInstallCloud}
              onUse={runTemplate}
            />
          ) : displayTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No templates found</p>
              <p className="text-xs mt-1">Try a different search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayTemplates.map((template) => (
                <button key={template.id} type="button" onClick={() => runTemplate(template.prompt)}
                  className="text-left rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all group">
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

        {/* Footer */}
        <div className="px-6 pb-4 pt-2 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors">
              <Upload size={13} /> Import Template
            </button>
            <button type="button" onClick={() => setShowPublish(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
              <Send size={13} /> Publish to Marketplace
            </button>
            <input ref={importInputRef} type="file" accept=".json,.sht.json" className="hidden" onChange={handleImportTemplate} />
          </div>
          <button type="button" onClick={onClose} className="py-2 px-4 text-sm text-gray-500 hover:text-gray-700">
            Start blank instead
          </button>
        </div>
      </div>

      {showPublish && (
        <PublishDialog
          templates={communityTemplates}
          onClose={() => setShowPublish(false)}
          onPublished={() => { setShowPublish(false); setActiveCategory('Marketplace'); fetchCloudTemplates() }}
        />
      )}
    </div>
  )
}

// ─── Tab Button ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, variant, children }: {
  active: boolean; onClick: () => void; variant?: 'emerald' | 'violet'; children: React.ReactNode
}) {
  let classes = 'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors '
  if (active) {
    classes += variant === 'emerald' ? 'bg-emerald-600 text-white' : variant === 'violet' ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white'
  } else {
    classes += variant === 'emerald' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : variant === 'violet' ? 'bg-violet-50 text-violet-600 hover:bg-violet-100'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  }
  return <button type="button" onClick={onClick} className={classes}>{children}</button>
}

// ─── Marketplace Grid ────────────────────────────────────────────────────────

function MarketplaceGrid({ templates, loading, sort, onSortChange, installingId, onInstall, onUse }: {
  templates: CloudTemplate[]; loading: boolean; sort: 'popular' | 'recent' | 'rating'
  onSortChange: (s: 'popular' | 'recent' | 'rating') => void
  installingId: string | null; onInstall: (t: CloudTemplate) => void; onUse: (prompt: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading marketplace...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Sort by:</span>
        {(['popular', 'recent', 'rating'] as const).map((s) => (
          <button key={s} type="button" onClick={() => onSortChange(s)}
            className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
              sort === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s === 'popular' ? '🔥 Popular' : s === 'recent' ? '🆕 Recent' : '⭐ Top rated'}
          </button>
        ))}
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Globe size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No community templates yet</p>
          <p className="text-xs mt-1">Be the first to publish one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between">
                <span className="text-2xl">{template.icon}</span>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  {template.rating !== null && (
                    <span className="flex items-center gap-0.5">
                      <Star size={10} className="text-amber-400 fill-amber-400" />
                      {template.rating}
                    </span>
                  )}
                  <span>· {template.downloads} installs</span>
                </div>
              </div>
              <p className="mt-2 font-semibold text-gray-900 text-sm">{template.name}</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{template.description}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-gray-400">by {template.author}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onUse(template.prompt)}
                    className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors">
                    Use
                  </button>
                  <button type="button" onClick={() => onInstall(template)} disabled={installingId === template.id}
                    className="px-2 py-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center gap-1">
                    {installingId === template.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                    Install
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Publish Dialog ──────────────────────────────────────────────────────────

function PublishDialog({ templates, onClose, onPublished }: {
  templates: CommunityTemplate[]; onClose: () => void; onPublished: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Personal Finance')

  const userId = localStorage.getItem('smartsht-user-id')
  const selectedTemplate = templates.find((t) => t.id === selectedId)

  useEffect(() => {
    if (selectedTemplate) {
      setName(selectedTemplate.name)
      setDescription(selectedTemplate.description)
      setCategory(selectedTemplate.category)
    }
  }, [selectedTemplate])

  async function handlePublish() {
    if (!userId || !name) return
    setPublishing(true)
    try {
      const res = await fetch(`${API_BASE}/api/community-templates`, {
        method: 'POST',
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          category,
          icon: selectedTemplate?.icon ?? '📄',
          prompt: selectedTemplate?.prompt ?? name,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) onPublished()
    } catch { /* ignore */ }
    setPublishing(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Publish to Marketplace</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {templates.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Select a template to publish</label>
              <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value || null)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="">— Or fill in manually below —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly Budget Tracker"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Track income, expenses, and savings goals..." rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200">
              {templateCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button type="button" onClick={handlePublish} disabled={!name || publishing || !userId}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {publishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Publish
          </button>
        </div>
      </div>
    </div>
  )
}
