import { useState, useEffect } from 'react'
import { Cloud, Download, Trash2, Plus, X, Loader2, HardDrive } from 'lucide-react'
import {
  listCloudWorkbooks,
  loadFromCloud,
  deleteFromCloud,
  createInCloud,
  isCloudConfigured,
  type CloudWorkbook,
} from '@/lib/cloudSync'
import { useStore } from '@/store/useStore'

interface WorkbookPickerProps {
  open: boolean
  onClose: () => void
}

export function WorkbookPicker({ open, onClose }: WorkbookPickerProps) {
  const { workbook, initWorkbook, showConfirm, showToast } = useStore()
  const [workbooks, setWorkbooks] = useState<CloudWorkbook[]>([])
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    if (open && isCloudConfigured()) {
      setLoading(true)
      listCloudWorkbooks()
        .then(setWorkbooks)
        .finally(() => setLoading(false))
    }
  }, [open])

  if (!open) return null

  const handleOpen = async (id: string) => {
    setActionId(id)
    const data = await loadFromCloud(id)
    if (data) {
      // Load into store — this replaces the current workbook
      useStore.getState().loadWorkbookData(data)
      onClose()
    }
    setActionId(null)
  }

  const handleDelete = async (id: string) => {
    const wb = workbooks.find((w) => w.id === id)
    showConfirm({
      title: 'Delete cloud workbook',
      message: `"${wb?.name || 'this workbook'}" will be permanently removed from the cloud. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setActionId(id)
        const ok = await deleteFromCloud(id)
        if (ok) {
          setWorkbooks((prev) => prev.filter((w) => w.id !== id))
          showToast({ type: 'success', message: 'Workbook deleted from cloud' })
        } else {
          showToast({ type: 'error', message: 'Failed to delete workbook' })
        }
        setActionId(null)
      },
    })
  }

  const handleSaveCurrent = async () => {
    setActionId('new')
    await createInCloud(workbook)
    // Refresh the list
    const fresh = await listCloudWorkbooks()
    setWorkbooks(fresh)
    setActionId(null)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60_000)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Cloud size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Cloud Workbooks</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[400px] overflow-y-auto">
          {!isCloudConfigured() ? (
            <div className="text-center py-8 text-gray-500">
              <Cloud size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Sign in to access cloud workbooks</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading workbooks...</span>
            </div>
          ) : workbooks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <HardDrive size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No cloud workbooks yet</p>
              <p className="text-xs text-gray-400 mt-1">Save your current workbook to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workbooks.map((wb) => (
                <div
                  key={wb.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Cloud size={16} className="text-blue-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{wb.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                      <span>{formatDate(wb.last_saved_at)}</span>
                      <span>·</span>
                      <span>{formatBytes(wb.size_bytes)}</span>
                      <span>·</span>
                      <span>{wb.sheet_count} sheet{wb.sheet_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleOpen(wb.id)}
                      disabled={actionId === wb.id}
                      className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors disabled:opacity-50"
                      title="Open"
                    >
                      {actionId === wb.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wb.id)}
                      disabled={actionId === wb.id}
                      className="p-1.5 rounded-md hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {isCloudConfigured() && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={handleSaveCurrent}
              disabled={actionId === 'new'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionId === 'new' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Save current workbook to cloud
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
