import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  Share2,
  Globe,
  Lock,
  Clock,
} from 'lucide-react'
import { getCloudWorkbookId, isCloudConfigured } from '@/lib/cloudSync'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

interface ShareEntry {
  id: string
  share_token: string
  permission: string
  expires_at: string | null
  created_at: string
}

interface ShareDialogProps {
  open: boolean
  onClose: () => void
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [permission, setPermission] = useState<'view' | 'edit'>('view')
  const [expiresIn, setExpiresIn] = useState<'24h' | '7d' | '30d' | 'never'>('never')

  const cloudId = getCloudWorkbookId()
  const userId = localStorage.getItem('smartsht-user-id')

  const fetchShares = useCallback(async () => {
    if (!cloudId || !userId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/workbooks/${cloudId}/shares`, {
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const json = (await res.json()) as { shares: ShareEntry[] }
        setShares(json.shares)
      }
    } catch {
      // ignore
    }
    setLoading(false)
  }, [cloudId, userId])

  useEffect(() => {
    if (open) fetchShares()
  }, [open, fetchShares])

  if (!open) return null

  const handleCreate = async () => {
    if (!cloudId || !userId) return
    setCreating(true)
    try {
      const res = await fetch(`${API_BASE}/api/workbooks/${cloudId}/share`, {
        method: 'POST',
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, expiresIn }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        await fetchShares()
      }
    } catch {
      // ignore
    }
    setCreating(false)
  }

  const handleRevoke = async (token: string) => {
    if (!userId) return
    if (!confirm('Revoke this share link? Anyone with it will lose access.')) return
    try {
      await fetch(`${API_BASE}/api/shares/${token}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      setShares((prev) => prev.filter((s) => s.share_token !== token))
    } catch {
      // ignore
    }
  }

  const handleCopy = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const isExpired = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Share Workbook</h2>
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

        {/* Not configured states */}
        {!isCloudConfigured() || !cloudId ? (
          <div className="p-6 text-center">
            <Globe size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">
              {!isCloudConfigured()
                ? 'Sign in to share workbooks'
                : 'Save this workbook to the cloud first before sharing.'}
            </p>
          </div>
        ) : (
          <>
            {/* Create new share */}
            <div className="p-5 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-3">
                Create a link anyone can use to view this workbook.
              </p>
              <div className="flex gap-2 mb-3">
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  aria-label="Permission"
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value as '24h' | '7d' | '30d' | 'never')}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  aria-label="Expiration"
                >
                  <option value="never">Never expires</option>
                  <option value="24h">Expires in 24 hours</option>
                  <option value="7d">Expires in 7 days</option>
                  <option value="30d">Expires in 30 days</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Link2 size={14} />
                )}
                Create share link
              </button>
            </div>

            {/* Existing shares */}
            <div className="max-h-[250px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Loading shares...</span>
                </div>
              ) : shares.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  No active share links
                </div>
              ) : (
                <div className="py-2">
                  {shares.map((share) => {
                    const expired = isExpired(share.expires_at)
                    return (
                      <div
                        key={share.id}
                        className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group ${
                          expired ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          {share.permission === 'edit' ? (
                            <Lock size={14} className="text-amber-500" />
                          ) : (
                            <Globe size={14} className="text-blue-500" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-700">
                              {share.permission === 'edit' ? 'Can edit' : 'View only'}
                            </span>
                            {expired && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">
                                Expired
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                            <Clock size={9} />
                            <span>
                              {share.expires_at
                                ? `Expires ${formatDate(share.expires_at)}`
                                : 'Never expires'}
                            </span>
                            <span>·</span>
                            <span>Created {formatDate(share.created_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleCopy(share.share_token)}
                            className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                            title="Copy link"
                          >
                            {copiedToken === share.share_token ? (
                              <Check size={13} className="text-green-600" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevoke(share.share_token)}
                            className="p-1.5 rounded-md hover:bg-red-100 text-red-500 transition-colors"
                            title="Revoke"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
