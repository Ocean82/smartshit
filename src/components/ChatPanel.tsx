import { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'
import {
  Send, Check, XCircle, Sparkles, Bot, User, Loader2, Paperclip, X, ThumbsUp, ThumbsDown, Copy, Download,
  PanelLeftClose, SquarePen, Pin, PinOff, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { AgentAction } from '@/types'
import { getFeedbackForMessage, recordChatFeedback, type ChatFeedbackRating } from '@/ai/chatFeedback'
import { exportChatAsReport } from '@/lib/exportChat'
import { useUsage, UpgradePrompt } from '@/auth'
import { ApiKeySettings } from './ApiKeySettings'
import { ChatMarkdown } from './ChatMarkdown'

function healthFooterMessage(health: ServerHealth | null): string {
  if (!health) return 'Instant analysis active · AI server connecting…'
  const hasCloud = !!(health.groq || health.openrouter || health.huggingface)
  if (health.ok && hasCloud) return 'Usually responds in a few seconds'
  if (health.ok || (health.ollama && health.modelRegistered)) {
    return 'First reply may take 1–2 min while the model loads'
  }
  return 'Instant analysis active · Skills work without AI'
}

/**
 * Renders the assistant chat panel with messaging, spreadsheet actions, attachments, feedback, and usage controls.
 *
 * @param isMobileOpen - Whether the standalone panel is open on mobile.
 * @param onCloseMobile - Callback invoked when the mobile panel is closed.
 * @param embedded - Whether to render the panel without standalone header and visibility controls.
 * @returns The assistant chat panel.
 */
export function ChatPanel({ isMobileOpen, onCloseMobile, embedded }: { isMobileOpen?: boolean; onCloseMobile?: () => void; embedded?: boolean }) {
  const {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    clearChat,
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
    togglePinMessage,
  } = useStore()

  const { canAsk, remaining, dailyLimit, recordUsage, isPro } = useUsage()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const resizingRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [health, setHealth] = useState<ServerHealth | null>(null)
  const [feedbackById, setFeedbackById] = useState<Record<string, ChatFeedbackRating>>({})
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClearChat = () => {
    if (messages.length <= 2) {
      // Only welcome + maybe 1 message — skip confirmation
      clearChat()
      return
    }
    if (confirmClear) {
      clearChat()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      // Auto-dismiss after 3 seconds
      setTimeout(() => setConfirmClear(false), 3000)
    }
  }
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

  // Ctrl+K is owned by the command palette (App). Focus via smartsht:focus-chat.
  useEffect(() => {
    const handler = () => inputRef.current?.focus()
    document.addEventListener('smartsht:focus-chat', handler)
    return () => document.removeEventListener('smartsht:focus-chat', handler)
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

  const handleSend = () => {
    if (!canAsk) return
    recordUsage()
    sendMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSkillClick = (prompt: string) => {
    if (!canAsk) return
    setChatInput(prompt)
    requestAnimationFrame(() => handleSend())
  }

  return (
    <div
      className={embedded
        ? 'flex flex-col h-full bg-white'
        : `
        relative flex flex-col bg-white shrink-0 border-r border-gray-200
        w-full
        ${isMobileOpen ? 'fixed inset-0 z-40' : showChat ? 'hidden md:flex' : 'hidden'}
      `}
      style={embedded ? undefined : (isMobileOpen || !showChat ? undefined : { width: chatWidth, minWidth: 280, maxWidth: 720 })}
    >
      {/* Header — only shown in standalone mode (DockPanel provides its own header) */}
      {!embedded && (
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-800))' }}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-amber-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">smartsh!t assistant</h2>
            <p className="text-[10px] truncate" style={{ color: 'var(--accent-300)' }}>Ask about this sheet or make a change</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className={`p-1.5 rounded-lg transition-colors ${
                confirmClear
                  ? 'bg-red-500/80 text-white hover:bg-red-500'
                  : 'text-blue-200 hover:bg-white/20 hover:text-white'
              }`}
              title={confirmClear ? 'Click again to confirm' : 'New conversation'}
              aria-label={confirmClear ? 'Confirm clear chat' : 'Start new conversation'}
            >
              <SquarePen size={15} />
            </button>
          )}
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
              aria-label="Close assistant"
              className="md:hidden p-1.5 rounded-lg text-white hover:bg-white/20"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      )}

      <div className="px-3 py-2.5 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1.5 md:flex-wrap">
          {skills.slice(0, 6).map((skill) => {
            const cat = skill.category?.toLowerCase() ?? ''
            const tint = cat === 'finance'
              ? 'bg-emerald-50/80 border-emerald-200/70 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300'
              : cat === 'business'
                ? 'bg-blue-50/80 border-blue-200/70 text-blue-800 hover:bg-blue-100 hover:border-blue-300'
                : cat === 'hr'
                  ? 'bg-violet-50/80 border-violet-200/70 text-violet-800 hover:bg-violet-100 hover:border-violet-300'
                  : cat === 'management'
                    ? 'bg-amber-50/80 border-amber-200/70 text-amber-800 hover:bg-amber-100 hover:border-amber-300'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'
            return (
              <button
                key={skill.id}
                type="button"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${tint}`}
                onClick={() => handleSkillClick(skill.prompt)}
                title={skill.description}
              >
                <span>{skill.icon}</span>
                <span className="font-medium">{skill.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Pinned messages section */}
        {messages.some((m) => m.pinned) && (
          <PinnedMessagesSection messages={messages.filter((m) => m.pinned)} onUnpin={togglePinMessage} onJumpTo={(id) => {
            document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }} />
        )}
        {messages.map((msg, idx) => {
          const isAssistant = msg.role === 'assistant'
          const isUser = msg.role === 'user'
          const isStreamingMsg = isAiProcessing && isAssistant && idx === messages.length - 1
          return (
          <div key={msg.id} id={`msg-${msg.id}`} className={`flex gap-3 ${isUser ? 'justify-end' : ''}${msg.pinned ? ' ring-1 ring-amber-200 rounded-2xl bg-amber-50/40 p-1' : ''}`}>
            {isAssistant && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md transition-transform hover:scale-105" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-600))' }}>
                <Bot size={16} className="text-white" />
              </div>
            )}
            <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm transition-shadow hover:shadow-md ${
                  isUser
                    ? 'text-white rounded-tr-none'
                    : 'text-slate-800 rounded-tl-none border border-slate-100'
                }`}
                style={isUser ? { background: 'linear-gradient(135deg, var(--accent-600), var(--accent-700))' } : { background: 'white' }}
              >
                <MessageContent content={msg.content} role={msg.role} isStreaming={isStreamingMsg} />
              </div>
              {isAssistant && msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-blue-100 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all text-left active:scale-95"
                      onClick={() => setChatInput(suggestion)}
                    >
                      <Sparkles size={10} className="inline mr-1 text-blue-400" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {isAssistant && (
                <div className="mt-2 flex items-center gap-2 px-1">
                  <button
                    type="button"
                    title="Copy message"
                    aria-label="Copy message to clipboard"
                    onClick={() => { void navigator.clipboard.writeText(msg.content) }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    title={msg.pinned ? 'Unpin message' : 'Pin message'}
                    aria-label={msg.pinned ? 'Unpin this message' : 'Pin this message for reference'}
                    onClick={() => togglePinMessage(msg.id)}
                    className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${msg.pinned ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {msg.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                  <div className="h-3 w-px bg-slate-200 mx-1" />
                  <button
                    type="button"
                    title="Helpful"
                    aria-label="Mark response helpful"
                    onClick={() => handleFeedback(msg.id, 'up')}
                    className={`p-1.5 rounded-lg hover:bg-emerald-50 transition-colors ${feedbackById[msg.id] === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-500'}`}
                  >
                    <ThumbsUp size={12} />
                  </button>
                  <button
                    type="button"
                    title="Not helpful"
                    aria-label="Mark response not helpful"
                    onClick={() => handleFeedback(msg.id, 'down')}
                    className={`p-1.5 rounded-lg hover:bg-rose-50 transition-colors ${feedbackById[msg.id] === 'down' ? 'text-rose-600 bg-rose-50' : 'text-slate-400 hover:text-rose-500'}`}
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
        )})}
        {isAiProcessing && (
          <div className="flex gap-3" role="status" aria-live="polite" aria-busy="true">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md animate-pulse" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-600))' }}>
              <Bot size={16} className="text-white" aria-hidden="true" />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-[13px] text-slate-500 font-medium">
                <Loader2 size={14} className="animate-spin text-blue-500" aria-hidden="true" />
                <span>
                  {messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content
                    ? 'Finishing up…'
                    : waitSeconds < 2
                      ? 'Analyzing your data…'
                      : waitSeconds < 5
                        ? 'Running analysis…'
                        : waitSeconds < 10
                          ? 'Consulting AI model…'
                          : `Thinking…${waitSeconds > 0 ? ` (${waitSeconds}s)` : ''}`
                  }
                </span>
              </div>
              {waitSeconds >= 3 && waitSeconds < 15 && !messages[messages.length - 1]?.content && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {waitSeconds >= 3 && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">✓ Context</span>}
                  {waitSeconds >= 5 && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">✓ Auditor</span>}
                  {waitSeconds >= 8 && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 animate-pulse">⟳ AI Model</span>}
                </div>
              )}
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

      <div className="px-3 py-3 border-t border-gray-200 bg-slate-50/80">
        {!isPro && <UpgradePrompt remaining={remaining} dailyLimit={dailyLimit} />}
        {attachedFilePreview && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip size={14} className="text-blue-600 shrink-0" />
              <span className="truncate text-blue-900">{attachedFilePreview.fileName}</span>
              <span className="text-blue-600 shrink-0">attached</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium"
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
            className="p-2.5 rounded-xl border border-gray-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 shrink-0 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAiProcessing}
            title="Attach spreadsheet file"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white min-h-[44px] max-h-[120px] md:min-h-[80px] placeholder:text-slate-400"
            rows={2}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. "Explain this spreadsheet" or "Build a monthly budget"'
          />
          <button
            type="button"
            className="p-2.5 rounded-xl text-white disabled:opacity-40 transition-colors shadow-sm shrink-0"
            style={{ background: 'var(--accent-600)' }}
            onClick={handleSend}
            disabled={!chatInput.trim() || isAiProcessing || !canAsk}
            title="Send message"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          {healthFooterMessage(health)}
        </p>
        <ApiKeySettings />
      </div>

      {/* Desktop drag handle to resize chat width — only in standalone mode */}
      {!embedded && (
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
      )}
    </div>
  )
}

function MessageContent({ content, role, isStreaming }: { content: string; role: string; isStreaming?: boolean }) {
  // During streaming, use simple text rendering to avoid expensive markdown re-parsing on every token
  if (role === 'assistant' && !isStreaming) {
    return <ChatMarkdown content={content} />
  }
  // User messages + streaming assistant messages: simple text with line breaks and basic formatting
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

function PinnedMessagesSection({
  messages,
  onUnpin,
  onJumpTo,
}: {
  messages: Array<{ id: string; content: string; timestamp: number }>
  onUnpin: (id: string) => void
  onJumpTo: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (messages.length === 0) return null

  return (
    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5">
          <Pin size={12} className="text-amber-600" />
          {messages.length} pinned message{messages.length > 1 ? 's' : ''}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-amber-200/60">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-700 truncate">{msg.content.slice(0, 120)}{msg.content.length > 120 ? '…' : ''}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  className="p-0.5 rounded text-amber-600 hover:bg-amber-100 text-[10px]"
                  onClick={() => onJumpTo(msg.id)}
                  title="Jump to message"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onUnpin(msg.id)}
                  title="Unpin"
                >
                  <PinOff size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
