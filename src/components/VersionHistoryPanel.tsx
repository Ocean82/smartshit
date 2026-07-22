import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import {
  listVersions,
  loadVersion,
  getCloudWorkbookId,
  isCloudConfigured,
  type VersionEntry,
} from '@/lib/cloudSync'
import { History, RotateCcw, Eye, X, Loader2, CloudOff, Clock, Save } from 'lucide-react'

export function VersionHistoryPanel() {
  const { showVersionHistory, setShowVersionHistory, loadWorkbookData, showConfirm, showToast } = useStore()
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const cloudId = getCloudWorkbookId()

  const fetchVersions = useCallback(async () => {
    if (!cloudId || !isCloudConfigured()) return
    setLoading(true)
    const result = await listVersions(cloudId)
    setVersions(result)
    setLoading(false)
  }, [cloudId])

  useEffect(() => {
    if (showVersionHistory) {
      fetchVersions()
    }
  }, [showVersionHistory, fetchVersions])

  if (!showVersionHistory) return null

  const handlePreview = async (versionId: string) => {
    if (!cloudId) return
    setActionId(versionId)
    setPreviewId(versionId)
    const data = await loadVersion(cloudId, versionId)
    if (data) {
      // Load in read-only preview mode
      loadWorkbookData(data)
    }
    setActionId(null)
  }

  const handleRestore = async (versionId: string) => {
    if (!cloudId) return

    showConfirm({
      title: 'Restore version',
      message: 'Your current workbook will be replaced with this older version. You can undo this with Ctrl+Z.',
      confirmLabel: 'Restore',
      variant: 'warning',
      onConfirm: async () => {
        setActionId(versionId)
        const data = await loadVersion(cloudId, versionId)
        if (data) {
          loadWorkbookData(data)
          setPreviewId(null)
          setShowVersionHistory(false)
          showToast({ type: 'success', message: 'Version restored' })
        } else {
          showToast({ type: 'error', message: 'Failed to restore version' })
        }
        setActionId(null)
      },
    })
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60_000)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    if (diffMin < 10080) return `${Math.floor(diffMin / 1440)}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="w-[300px] border-l border-gray-200 bg-white h-full overflow-hidden flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <History size={14} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowVersionHistory(false)}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close version history"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!isCloudConfigured() ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <CloudOff size={28} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-1">Cloud not configured</p>
            <p className="text-xs text-gray-400">Sign in and save to the cloud to enable version history.</p>
          </div>
        ) : !cloudId ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Save size={28} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-1">No cloud workbook</p>
            <p className="text-xs text-gray-400">Save this workbook to the cloud first to track versions.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading versions...</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Clock size={28} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No versions yet</p>
            <p className="text-xs text-gray-400 mt-1">Versions are created automatically when you save.</p>
          </div>
        ) : (
          <div className="py-2">
            {versions.map((version, idx) => (
              <div
                key={version.id}
                className={`group px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  previewId === version.id ? 'bg-blue-50 border-blue-100' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900">
                        v{version.version_number}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                          Latest
                        </span>
                      )}
                      {previewId === version.id && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                          Previewing
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {version.description || 'Auto-save'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{formatDate(version.created_at)}</span>
                      <span>·</span>
                      <span>{formatBytes(version.size_bytes)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => handlePreview(version.id)}
                      disabled={actionId === version.id}
                      className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors disabled:opacity-50"
                      title="Preview this version"
                    >
                      {actionId === version.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(version.id)}
                      disabled={actionId === version.id}
                      className="p-1.5 rounded-md hover:bg-amber-100 text-amber-600 transition-colors disabled:opacity-50"
                      title="Restore this version"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer info */}
      {versions.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 text-center">
            {versions.length} version{versions.length !== 1 ? 's' : ''} · Free plan: up to 50
          </p>
        </div>
      )}
    </div>
  )
}
