import { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'
import {
  Send, Check, XCircle, Sparkles, Bot, User, Loader2, Paperclip, X, ThumbsUp, ThumbsDown, Copy, Download,
  PanelLeftClose,
} from 'lucide-react'
import type { AgentAction } from '@/types'
import { getFeedbackForMessage, recordChatFeedback, type ChatFeedbackRating } from '@/ai/chatFeedback'
import { exportChatAsReport } from '@/lib/exportChat'

function healthFooterMessage(health: ServerHealth | null): string {
  if (!health) return 'Instant analysis active · AI server connecting…'
  const hasCloud = !!(health.groq || health.openrouter || health.huggingface)
  if (health.ok && hasCloud) return 'Usually responds in a few seconds'
  if (health.ok || (health.ollama && health.modelRegistered)) {
    return 'First reply may take 1–2 min while the model loads'
  }
  return 'Instant analysis active · Skills work without AI'
}

export function ChatPanel({ isMobileOpen, onCloseMobile }: { isMobileOpen?: boolean; onCloseMobile?: () => void }) {
  const {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    isAiProcessing,
    applyAction,
    rejectAction,
    skills,
    attachedFilePreview,
    attachFileForChat,
    importAttachedFile,
    clearAttachedFile,
    workbook,
    chatWidth,
    setChatWidth,
    toggleChat,
    showChat,
  } = useStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const resizingRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [health, setHealth] = useState<ServerHealth | null>(null)
  const [feedbackById, setFeedbackById] = useState<Record<string, ChatFeedbackRating>>({})

  useEffect(() => {
    const map: Record<string, ChatFeedbackRating> = {}
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const rating = getFeedbackForMessage(msg.id)
      if (rating) map[msg.id] = rating
    }
    setFeedbackById(map)
  }, [messages])

  const handleFeedback = (messageId: string, rating: ChatFeedbackRating) => {
    recordChatFeedback(messageId, rating)
    setFeedbackById((prev) => ({ ...prev, [messageId]: rating }))
  }

  useEffect(() => {
    let interval = 15000
    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      const result = await fetchServerHealth()
      setHealth(result)
      // Backoff on failure: 15s → 30s → 60s; reset on success
      interval = result?.ok ? 15000 : Math.min(interval * 2, 60000)
      timeoutId = setTimeout(poll, interval)
    }

    void poll()
    return () => clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Keyboard shortcut: Ctrl+K / Cmd+K focuses chat input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!isAiProcessing) {
      setWaitSeconds(0)
      return
    }
    const started = Date.now()
    const id = setInterval(() => {
      setWaitSeconds(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isAiProcessing])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startWidth = chatWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      setChatWidth(startWidth + (ev.clientX - startX))
    }
    const onUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [chatWidth, setChatWidth])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSkillClick = (prompt: string) => {
    setChatInput(prompt)
    requestAnimationFrame(() => sendMessage())
  }

  return (
    <div
      className={`
        relative flex flex-col bg-white shrink-0 border-r border-gray-200
        w-full
        ${isMobileOpen ? 'fixed inset-0 z-40' : showChat ? 'hidden md:flex' : 'hidden'}
      `}
      style={isMobileOpen || !showChat ? undefined : { width: chatWidth, minWidth: 280, maxWidth: 720 }}
    >
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-slate-800 to-blue-800">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-amber-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">smartsh!t assistant</h2>
            <p className="text-[10px] text-blue-200 truncate">Describe what you need — I handle the rest</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={() => exportChatAsReport(messages, workbook.name)}
              className="p-1.5 rounded-lg text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
              title="Export conversation as report"
              aria-label="Export conversation as report"
            >
              <Download size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleChat()}
            className="hidden md:inline-flex p-1.5 rounded-lg text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
            title="Hide assistant (full spreadsheet view)"
            aria-label="Hide assistant"
          >
            <PanelLeftClose size={15} />
          </button>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-white hover:bg-white/20"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1.5 md:flex-wrap">
          {skills.slice(0, 6).map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-50 rounded-full border border-gray-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
              onClick={() => handleSkillClick(skill.prompt)}
              title={skill.description}
            >
              <span>{skill.icon}</span>
              <span>{skill.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className={`max-w-[90%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}
              >
                <MessageContent content={msg.content} />
              </div>
              {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="px-2.5 py-1 text-[11px] rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors text-left"
                      onClick={() => setChatInput(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    title="Copy message"
                    aria-label="Copy message to clipboard"
                    onClick={() => { void navigator.clipboard.writeText(msg.content) }}
                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    title="Helpful"
                    aria-label="Mark response helpful"
                    onClick={() => handleFeedback(msg.id, 'up')}
                    className={`p-1 rounded hover:bg-gray-200 ${feedbackById[msg.id] === 'up' ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    <ThumbsUp size={12} />
                  </button>
                  <button
                    type="button"
                    title="Not helpful"
                    aria-label="Mark response not helpful"
                    onClick={() => handleFeedback(msg.id, 'down')}
                    className={`p-1 rounded hover:bg-gray-200 ${feedbackById[msg.id] === 'down' ? 'text-red-600' : 'text-gray-400'}`}
                  >
                    <ThumbsDown size={12} />
                  </button>
                </div>
              )}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.actions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onApply={() => applyAction(action.id)}
                      onReject={() => rejectAction(action.id)}
                    />
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}
        {isAiProcessing && (
          <div className="flex gap-2" role="status" aria-live="polite" aria-busy="true">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-blue-600 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-white" aria-hidden="true" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span>
                  {messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content
                    ? 'Finishing up…'
                    : `Thinking…${waitSeconds > 0 ? ` (${waitSeconds}s)` : ''}`
                  }
                </span>
              </div>
              {waitSeconds >= 15 && !messages[messages.length - 1]?.content && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Template requests like &quot;build a budget&quot; are instant. Open-ended questions take a few seconds.
                </p>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 py-3 border-t border-gray-200 bg-gray-50">
        {attachedFilePreview && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip size={14} className="text-blue-600 shrink-0" />
              <span className="truncate text-blue-900">{attachedFilePreview.fileName}</span>
              <span className="text-blue-600 shrink-0">— asking about attached file</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => void importAttachedFile()}
              >
                Import
              </button>
              <button
                type="button"
                className="p-1 rounded-md text-blue-700 hover:bg-blue-100"
                onClick={clearAttachedFile}
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {attachedFilePreview?.importWarnings?.length ? (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
            {attachedFilePreview.importWarnings.join(' ')}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            aria-label="Attach spreadsheet file"
            title="Attach spreadsheet file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void attachFileForChat(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="p-2.5 rounded-xl border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAiProcessing}
            title="Attach spreadsheet file"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none bg-white min-h-[44px] max-h-[120px] md:min-h-[80px]"
            rows={2}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. "Explain this spreadsheet" or "Where am I overspending?" (Ctrl+K)'
          />
          <button
            type="button"
            className="p-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-blue-700 text-white hover:from-slate-900 hover:to-blue-800 disabled:opacity-50 transition-all shadow-sm shrink-0"
            onClick={sendMessage}
            disabled={!chatInput.trim() || isAiProcessing}
            title="Send message"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          {healthFooterMessage(health)}
        </p>
      </div>

      {/* Desktop drag handle to resize chat width */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        title="Drag to resize"
        onMouseDown={handleResizeStart}
        className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group hover:bg-blue-400/40 active:bg-blue-500/50"
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-blue-500 transition-colors" />
      </div>
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|\n)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function ActionCard({
  action,
  onApply,
  onReject,
}: {
  action: AgentAction
  onApply: () => void
  onReject: () => void
}) {
  const statusColors = {
    pending: 'border-amber-200 bg-amber-50',
    applied: 'border-green-200 bg-green-50',
    rejected: 'border-red-200 bg-red-50',
    preview: 'border-blue-200 bg-blue-50',
  }

  return (
    <div className={`rounded-xl border-2 ${statusColors[action.status]} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-700">{action.description}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 font-mono">tool: {action.tool}</p>
        </div>
        {action.status === 'applied' && (
          <span className="text-[10px] font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Applied</span>
        )}
        {action.status === 'rejected' && (
          <span className="text-[10px] font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Rejected</span>
        )}
      </div>

      {action.preview && action.status === 'pending' && (
        <div className="mt-2 bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Preview changes:</p>
          <div className="space-y-0.5">
            {action.preview.changes.slice(0, 5).map((change, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <span className="font-mono text-blue-600">{change.cell}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700 truncate">{String(change.newValue ?? change.newFormula ?? '')}</span>
              </div>
            ))}
            {action.preview.changes.length > 5 && (
              <p className="text-[10px] text-gray-400">+{action.preview.changes.length - 5} more changes</p>
            )}
          </div>
        </div>
      )}

      {action.status === 'pending' && (
        <div className="flex gap-2 mt-2.5">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            onClick={onApply}
          >
            <Check size={12} />
            Apply
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-white text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={onReject}
          >
            <XCircle size={12} />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
