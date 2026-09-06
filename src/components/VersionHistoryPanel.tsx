import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import {
  listVersions,
  loadVersion,
  getCloudWorkbookId,
  isCloudConfigured,
  type VersionEntry,
} from '@/lib/cloudSync'
import { useUsage } from '@/auth'
import { UpgradeGate } from '@/components/UpgradeGate'
import { ReadOnlyGrid } from '@/components/ReadOnlyGrid'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import {
  History,
  RotateCcw,
  Eye,
  X,
  Loader2,
  CloudOff,
  Clock,
  Save,
  FileText,
} from 'lucide-react'
import type { WorkbookData } from '@/types'

interface PreviewState {
  version: VersionEntry
  workbook: WorkbookData
  sheetId: string | null
}

export function VersionHistoryPanel() {
  const { showVersionHistory, setShowVersionHistory, loadWorkbookData, showConfirm, showToast } = useStore()
  const { isPro } = useUsage()
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const focusTrapRef = useFocusTrap<HTMLDivElement>(!!preview)
  useEscapeToClose(!!preview, () => setPreview(null))

  const cloudId = getCloudWorkbookId()

  const closePreview = useCallback(() => setPreview(null), [])

  const fetchVersions = useCallback(async () => {
    if (!cloudId || !isCloudConfigured()) return
    setLoading(true)
    const result = await listVersions(cloudId)
    setVersions(result)
    setLoading(false)
  }, [cloudId])

  useEffect(() => {
    if (showVersionHistory && isPro) {
      void fetchVersions()
    }
  }, [showVersionHistory, fetchVersions, isPro])

  // Version history is Pro-only — render gate after all hooks
  if (showVersionHistory && !isPro) {
    return (
      <div className="w-[300px] border-l border-gray-200 bg-white h-full flex flex-col shrink-0 p-4 max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Version History</h3>
          <button type="button" onClick={() => setShowVersionHistory(false)} className="p-1 rounded-lg transition-colors" style={{ color: 'var(--neutral-400)' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <UpgradeGate feature="version-history" onDismiss={() => setShowVersionHistory(false)} />
      </div>
    )
  }

  if (!showVersionHistory) return null

  const handlePreview = async (version: VersionEntry) => {
    if (!cloudId) return
    setActionId(version.id)
    const data = await loadVersion(cloudId, version.id)
    setActionId(null)
    if (!data) {
      showToast({ type: 'error', message: 'Failed to load version preview' })
      return
    }
    setPreview({
      version,
      workbook: data,
      sheetId: data.activeSheetId ?? data.sheets[0]?.id ?? null,
    })
  }

  const handleRestore = (versionId: string) => {
    if (!cloudId) return

    showConfirm({
      title: 'Restore version',
      message:
        'Your current workbook will be replaced with this version. A snapshot of your current workbook is saved to undo history, so you can undo this with Ctrl+Z.',
      confirmLabel: 'Restore',
      variant: 'warning',
      onConfirm: async () => {
        setActionId(versionId)
        const data = await loadVersion(cloudId, versionId)
        setActionId(null)
        if (data) {
          loadWorkbookData(data, { pushUndo: true })
          setPreview(null)
          setShowVersionHistory(false)
          showToast({ type: 'success', message: 'Version restored' })
        } else {
          showToast({ type: 'error', message: 'Failed to restore version' })
        }
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

  const previewSheet = preview
    ? preview.workbook.sheets.find((s) => s.id === preview.sheetId) ?? preview.workbook.sheets[0]
    : null

  return (
    <>
      <div className="w-[300px] border-l border-gray-200 bg-white h-full overflow-hidden flex flex-col shrink-0 max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History size={14} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowVersionHistory(false)}
            className="p-1 max-md:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
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
                    preview?.version.id === version.id ? 'bg-blue-50 border-blue-100' : ''
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
                        {preview?.version.id === version.id && (
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

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={() => handlePreview(version)}
                        disabled={actionId === version.id}
                        className="p-1.5 max-md:p-2.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors disabled:opacity-50"
                        aria-label={`Preview version v${version.version_number}`}
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
                        className="p-1.5 max-md:p-2.5 rounded-md hover:bg-amber-100 text-amber-600 transition-colors disabled:opacity-50"
                        aria-label={`Restore version v${version.version_number}`}
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

      {/* Read-only preview overlay */}
      {preview && previewSheet && (
        <div
          ref={focusTrapRef}
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview version v${preview.version.version_number}`}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closePreview}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-4xl h-[92dvh] md:h-[80vh] flex flex-col overflow-hidden safe-area-bottom">
            <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
              <FileText size={16} className="text-gray-400" />
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  Preview v{preview.version.version_number} · {preview.workbook.name}
                </h4>
                <p className="text-[11px] text-gray-500 truncate">
                  {preview.version.description || 'Auto-save'} · {formatDate(preview.version.created_at)}
                </p>
              </div>
              {preview.workbook.sheets.length > 1 && (
                <div className="flex items-center gap-1 ml-2 overflow-x-auto">
                  {preview.workbook.sheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => setPreview({ ...preview, sheetId: sheet.id })}
                      className={`px-2.5 py-1 text-[11px] rounded-md whitespace-nowrap border transition-colors ${
                        preview.sheetId === sheet.id
                          ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => handleRestore(preview.version.id)}
                disabled={actionId === preview.version.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {actionId === preview.version.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Restore this version
              </button>
              <button
                type="button"
                onClick={closePreview}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-auto bg-white">
              <ReadOnlyGrid sheet={previewSheet} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}