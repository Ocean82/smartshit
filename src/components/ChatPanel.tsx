import React, { useRef, useEffect, useState, useCallback } from 'react'
import { shouldStickChatToBottom } from '@/lib/chatScroll'
import type { ServerHealth } from '@/ai/agentClient'
import { useServerHealth } from '@/ai/useServerHealth'
import {
  Send, Check, XCircle, Sparkles, Bot, User, Loader2, Paperclip, X, ThumbsUp, ThumbsDown, Copy, Download,
  PanelLeftClose, SquarePen, Pin, PinOff, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { AgentAction, ChatMessage as ChatMessageType } from '@/types'
import { getFeedbackForMessage, recordChatFeedback, type ChatFeedbackRating } from '@/ai/chatFeedback'
import { exportChatAsReport } from '@/lib/exportChat'
import { useUsage, UpgradePrompt } from '@/auth'
import { ApiKeySettings } from './ApiKeySettings'
import { ChatMarkdown } from './ChatMarkdown'
import {
  useMessages,
  useChatInput,
  useSetChatInput,
  useSendMessage,
  useClearChat,
  useIsAiProcessing,
  useApplyAction,
  useRejectAction,
  useSkills,
  useAttachedFilePreview,
  useAttachFileForChat,
  useImportAttachedFile,
  useClearAttachedFile,
  useWorkbook,
  useChatWidth,
  useSetChatWidth,
  useToggleChat,
  useShowChat,
  useTogglePinMessage,
} from '@/hooks/useSpreadsheet'

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const SKILL_TINT_MAP: Record<string, string> = {
  finance: 'bg-emerald-50/80 border-emerald-200/70 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300',
  business: 'bg-blue-50/80 border-blue-200/70 text-blue-800 hover:bg-blue-100 hover:border-blue-300',
  hr: 'bg-violet-50/80 border-violet-200/70 text-violet-800 hover:bg-violet-100 hover:border-violet-300',
  management: 'bg-amber-50/80 border-amber-200/70 text-amber-800 hover:bg-amber-100 hover:border-amber-300',
}
const DEFAULT_SKILL_TINT = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'

function getSkillTint(category?: string): string {
  return SKILL_TINT_MAP[category?.toLowerCase() ?? ''] ?? DEFAULT_SKILL_TINT
}

function healthFooterMessage(health: ServerHealth | null): string {
  if (!health) return 'Instant analysis active · AI server connecting…'
  const hasCloud = !!(health.groq || health.openrouter || health.huggingface)
  if (health.ok && hasCloud) return 'Usually responds in a few seconds'
  if (health.ok || (health.ollama && health.modelRegistered)) {
    return 'First reply may take 1–2 min while the model loads'
  }
  return 'Instant analysis active · Skills work without AI'
}

function getWaitingLabel(waitSeconds: number, hasStreamContent: boolean): string {
  if (hasStreamContent) return 'Finishing up…'
  if (waitSeconds < 2) return 'Analyzing your data…'
  if (waitSeconds < 5) return 'Running analysis…'
  if (waitSeconds < 10) return 'Consulting AI model…'
  return `Thinking…${waitSeconds > 0 ? ` (${waitSeconds}s)` : ''}`
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChatPanelProps {
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  embedded?: boolean
}

/**
 * Renders the assistant chat panel with messaging, spreadsheet actions, attachments, feedback, and usage controls.
 */
export function ChatPanel({ isMobileOpen, onCloseMobile, embedded }: ChatPanelProps) {
  const messages = useMessages()
  const chatInput = useChatInput()
  const setChatInput = useSetChatInput()
  const sendMessage = useSendMessage()
  const clearChat = useClearChat()
  const isAiProcessing = useIsAiProcessing()
  const applyAction = useApplyAction()
  const rejectAction = useRejectAction()
  const skills = useSkills()
  const attachedFilePreview = useAttachedFilePreview()
  const attachFileForChat = useAttachFileForChat()
  const importAttachedFile = useImportAttachedFile()
  const clearAttachedFile = useClearAttachedFile()
  const workbook = useWorkbook()
  const chatWidth = useChatWidth()
  const setChatWidth = useSetChatWidth()
  const toggleChat = useToggleChat()
  const showChat = useShowChat()
  const togglePinMessage = useTogglePinMessage()

  const { canAsk, remaining, dailyLimit, recordUsage, isPro } = useUsage()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastLiveIdRef = useRef('')
  const lastLiveLenRef = useRef(0)

  const [waitSeconds, setWaitSeconds] = useState(0)
  const health = useServerHealth()
  const [feedbackById, setFeedbackById] = useState<Record<string, ChatFeedbackRating>>({})
  const [confirmClear, setConfirmClear] = useState(false)

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    resizeStartRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    const map: Record<string, ChatFeedbackRating> = {}
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const rating = getFeedbackForMessage(msg.id)
      if (rating) map[msg.id] = rating
    }
    setFeedbackById(map)
  }, [messages])

  useEffect(() => {
    const list = messagesListRef.current
    const end = messagesEndRef.current
    if (!list || !end) return
    const lastRole = messages[messages.length - 1]?.role
    if (!shouldStickChatToBottom(list, lastRole)) return
    const frame = requestAnimationFrame(() => {
      end.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
    return () => cancelAnimationFrame(frame)
  }, [messages])

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

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleClearChat = () => {
    if (messages.length <= 2) { clearChat(); return }
    if (confirmClear) { clearChat(); setConfirmClear(false) }
    else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000) }
  }

  const handleFeedback = (messageId: string, rating: ChatFeedbackRating) => {
    recordChatFeedback(messageId, rating)
    setFeedbackById((prev) => ({ ...prev, [messageId]: rating }))
  }

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeStartRef.current = { x: e.clientX, width: chatWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatWidth])

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start) return
    if ((e.buttons & 1) === 0) { handleResizeEnd(e); return }
    setChatWidth(start.width + (e.clientX - start.x))
  }, [setChatWidth, handleResizeEnd])

  const handleSend = () => {
    if (!canAsk) return
    recordUsage()
    sendMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSkillClick = (prompt: string) => {
    if (!canAsk) return
    setChatInput(prompt)
    requestAnimationFrame(() => handleSend())
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const pinnedMessages = messages.filter((m) => m.pinned)

  return (
    <div
      className={embedded
        ? 'flex flex-col h-full bg-white'
        : `relative flex flex-col bg-white shrink-0 border-r border-gray-200 w-full ${isMobileOpen ? 'fixed inset-0 z-40' : showChat ? 'hidden md:flex' : 'hidden'}`}
      style={embedded ? undefined : (isMobileOpen || !showChat ? undefined : { width: chatWidth, minWidth: 280, maxWidth: 720 })}
    >
      {!embedded && (
        <ChatHeader
          messageCount={messages.length}
          confirmClear={confirmClear}
          onClear={handleClearChat}
          onExport={() => exportChatAsReport(messages, workbook.name)}
          onToggle={toggleChat}
          onCloseMobile={onCloseMobile}
        />
      )}

      <SkillBar skills={skills} onSkillClick={handleSkillClick} />

      <div ref={messagesListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {pinnedMessages.length > 0 && (
          <PinnedMessagesSection messages={pinnedMessages} onUnpin={togglePinMessage} onJumpTo={(id) => {
            document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }} />
        )}

        {messages.map((msg, idx) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            isStreaming={isAiProcessing && msg.role === 'assistant' && idx === messages.length - 1}
            feedback={feedbackById[msg.id]}
            onFeedback={handleFeedback}
            onPin={togglePinMessage}
            onSuggestionClick={setChatInput}
            onApplyAction={applyAction}
            onRejectAction={rejectAction}
          />
        ))}

        {isAiProcessing && (
          <WaitingIndicator
            waitSeconds={waitSeconds}
            hasStreamContent={!!(messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content)}
          />
        )}
        <div ref={messagesEndRef} />
        <LiveStreamRegion
          streaming={isAiProcessing}
          message={messages[messages.length - 1]}
          liveIdRef={lastLiveIdRef}
          liveLenRef={lastLiveLenRef}
        />
      </div>

      <ChatInputArea
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        isProcessing={isAiProcessing}
        canAsk={canAsk}
        isPro={isPro}
        remaining={remaining}
        dailyLimit={dailyLimit}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        attachedFilePreview={attachedFilePreview}
        onAttachFile={attachFileForChat}
        onImportFile={importAttachedFile}
        onClearFile={clearAttachedFile}
        health={health}
      />

      {!embedded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          title="Drag to resize"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group hover:bg-blue-400/40 active:bg-blue-500/50 touch-none"
        >
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-blue-500 transition-colors" />
        </div>
      )}
    </div>
  )
}

// ─── ChatHeader ───────────────────────────────────────────────────────────────

interface ChatHeaderProps {
  messageCount: number
  confirmClear: boolean
  onClear: () => void
  onExport: () => void
  onToggle: () => void
  onCloseMobile?: () => void
}

function ChatHeader({ messageCount, confirmClear, onClear, onExport, onToggle, onCloseMobile }: ChatHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-800))' }}>
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={18} className="text-amber-300 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white truncate">smartsh!t assistant</h2>
          <p className="text-[10px] truncate" style={{ color: 'var(--accent-300)' }}>Ask about this sheet or make a change</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {messageCount > 1 && (
          <button
            type="button"
            onClick={onClear}
            className={`p-1.5 rounded-lg transition-colors ${confirmClear ? 'bg-red-500/80 text-white hover:bg-red-500' : 'text-blue-200 hover:bg-white/20 hover:text-white'}`}
            title={confirmClear ? 'Click again to confirm' : 'New conversation'}
            aria-label={confirmClear ? 'Confirm clear chat' : 'Start new conversation'}
          >
            <SquarePen size={15} />
          </button>
        )}
        {messageCount > 1 && (
          <button
            type="button"
            onClick={onExport}
            className="p-1.5 rounded-lg text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
            title="Export conversation as report"
            aria-label="Export conversation as report"
          >
            <Download size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
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
  )
}

// ─── SkillBar ─────────────────────────────────────────────────────────────────

interface SkillBarProps {
  skills: Array<{ id: string; name: string; icon: string; prompt: string; description: string; category?: string }>
  onSkillClick: (prompt: string) => void
}

function SkillBar({ skills, onSkillClick }: SkillBarProps) {
  return (
    <div className="px-3 py-2.5 border-b border-gray-100 overflow-x-auto scrollbar-hide">
      <div className="flex gap-1.5 md:flex-wrap">
        {skills.slice(0, 6).map((skill) => (
          <button
            key={skill.id}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${getSkillTint(skill.category)}`}
            onClick={() => onSkillClick(skill.prompt)}
            title={skill.description}
          >
            <span>{skill.icon}</span>
            <span className="font-medium">{skill.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────

interface ChatBubbleProps {
  msg: ChatMessageType
  isStreaming: boolean
  feedback?: ChatFeedbackRating
  onFeedback: (id: string, rating: ChatFeedbackRating) => void
  onPin: (id: string) => void
  onSuggestionClick: (text: string) => void
  onApplyAction: (id: string) => void
  onRejectAction: (id: string) => void
}

function ChatBubble({ msg, isStreaming, feedback, onFeedback, onPin, onSuggestionClick, onApplyAction, onRejectAction }: ChatBubbleProps) {
  const isAssistant = msg.role === 'assistant'
  const isUser = msg.role === 'user'

  return (
    <div id={`msg-${msg.id}`} className={`flex gap-3 ${isUser ? 'justify-end' : ''}${msg.pinned ? ' ring-1 ring-amber-200 rounded-2xl bg-amber-50/40 p-1' : ''}`}>
      {isAssistant && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md transition-transform hover:scale-105" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-600))' }}>
          <Bot size={16} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm transition-shadow hover:shadow-md ${
            isUser ? 'text-white rounded-tr-none' : 'text-slate-800 rounded-tl-none border border-slate-100'
          }`}
          style={isUser ? { background: 'linear-gradient(135deg, var(--accent-600), var(--accent-700))' } : { background: 'white' }}
        >
          <MessageContent content={msg.content} role={msg.role} isStreaming={isStreaming} />
        </div>

        {isAssistant && msg.suggestions && msg.suggestions.length > 0 && (
          <SuggestionChips suggestions={msg.suggestions} onClick={onSuggestionClick} />
        )}

        {isAssistant && import.meta.env.DEV && msg.providerMeta && (
          <details className="mt-1 px-1 text-[10px] text-slate-400">
            <summary className="cursor-pointer select-none hover:text-slate-600">provider details</summary>
            <span className="font-mono">{msg.providerMeta.provider} · {msg.providerMeta.model}</span>
          </details>
        )}

        {isAssistant && (
          <MessageToolbar
            messageId={msg.id}
            content={msg.content}
            pinned={msg.pinned}
            feedback={feedback}
            onFeedback={onFeedback}
            onPin={onPin}
          />
        )}

        {msg.actions && msg.actions.length > 0 && (
          <div className="mt-2 space-y-2">
            {msg.actions.map((action) => (
              <ActionCard key={action.id} action={action} onApply={() => onApplyAction(action.id)} onReject={() => onRejectAction(action.id)} />
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-gray-600" />
        </div>
      )}
    </div>
  )
}

// ─── SuggestionChips ──────────────────────────────────────────────────────────

function SuggestionChips({ suggestions, onClick }: { suggestions: string[]; onClick: (s: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-blue-100 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all text-left active:scale-95"
          onClick={() => onClick(suggestion)}
        >
          <Sparkles size={10} className="inline mr-1 text-blue-400" />
          {suggestion}
        </button>
      ))}
    </div>
  )
}

// ─── MessageToolbar ───────────────────────────────────────────────────────────

interface MessageToolbarProps {
  messageId: string
  content: string
  pinned?: boolean
  feedback?: ChatFeedbackRating
  onFeedback: (id: string, rating: ChatFeedbackRating) => void
  onPin: (id: string) => void
}

function MessageToolbar({ messageId, content, pinned, feedback, onFeedback, onPin }: MessageToolbarProps) {
  return (
    <div className="mt-2 flex items-center gap-2 px-1">
      <button
        type="button"
        title="Copy message"
        aria-label="Copy message to clipboard"
        onClick={() => { void navigator.clipboard.writeText(content) }}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <Copy size={12} />
      </button>
      <button
        type="button"
        title={pinned ? 'Unpin message' : 'Pin message'}
        aria-label={pinned ? 'Unpin this message' : 'Pin this message for reference'}
        onClick={() => onPin(messageId)}
        className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${pinned ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600'}`}
      >
        {pinned ? <PinOff size={12} /> : <Pin size={12} />}
      </button>
      <div className="h-3 w-px bg-slate-200 mx-1" />
      <button
        type="button"
        title="Helpful"
        aria-label="Mark response helpful"
        onClick={() => onFeedback(messageId, 'up')}
        className={`p-1.5 rounded-lg hover:bg-emerald-50 transition-colors ${feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-500'}`}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        type="button"
        title="Not helpful"
        aria-label="Mark response not helpful"
        onClick={() => onFeedback(messageId, 'down')}
        className={`p-1.5 rounded-lg hover:bg-rose-50 transition-colors ${feedback === 'down' ? 'text-rose-600 bg-rose-50' : 'text-slate-400 hover:text-rose-500'}`}
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  )
}

// ─── WaitingIndicator ─────────────────────────────────────────────────────────

function WaitingIndicator({ waitSeconds, hasStreamContent }: { waitSeconds: number; hasStreamContent: boolean }) {
  return (
    <div className="flex gap-3" role="status" aria-live="polite" aria-busy="true">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md animate-pulse" style={{ background: 'linear-gradient(135deg, var(--neutral-950), var(--accent-600))' }}>
        <Bot size={16} className="text-white" aria-hidden="true" />
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-[13px] text-slate-500 font-medium">
          <Loader2 size={14} className="animate-spin text-blue-500" aria-hidden="true" />
          <span>{getWaitingLabel(waitSeconds, hasStreamContent)}</span>
        </div>
        {waitSeconds >= 3 && waitSeconds < 15 && !hasStreamContent && (
          <ProgressSteps waitSeconds={waitSeconds} />
        )}
        {waitSeconds >= 15 && !hasStreamContent && (
          <p className="mt-1 text-[11px] text-gray-400">
            Template requests like &quot;build a budget&quot; are instant. Open-ended questions take a few seconds.
          </p>
        )}
      </div>
    </div>
  )
}

function ProgressSteps({ waitSeconds }: { waitSeconds: number }) {
  const steps = [
    { threshold: 3, label: '✓ Context', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    { threshold: 5, label: '✓ Auditor', color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { threshold: 8, label: '⟳ AI Model', color: 'text-purple-600 bg-purple-50 border-purple-100 animate-pulse' },
  ]

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {steps.filter((s) => waitSeconds >= s.threshold).map((s) => (
        <span key={s.label} className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${s.color}`}>
          {s.label}
        </span>
      ))}
    </div>
  )
}

// ─── ChatInputArea ────────────────────────────────────────────────────────────

interface ChatInputAreaProps {
  chatInput: string
  setChatInput: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  isProcessing: boolean
  canAsk: boolean
  isPro: boolean
  remaining: number
  dailyLimit: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  attachedFilePreview: { fileName: string; importWarnings?: string[] } | null
  onAttachFile: (file: File) => void
  onImportFile: () => void
  onClearFile: () => void
  health: ServerHealth | null
}

function ChatInputArea({
  chatInput, setChatInput, onSend, onKeyDown, isProcessing, canAsk,
  isPro, remaining, dailyLimit, fileInputRef, inputRef,
  attachedFilePreview, onAttachFile, onImportFile, onClearFile, health,
}: ChatInputAreaProps) {
  return (
    <div className="px-3 py-3 border-t border-gray-200 bg-slate-50/80">
      {!isPro && <UpgradePrompt remaining={remaining} dailyLimit={dailyLimit} />}

      {attachedFilePreview && (
        <AttachmentBanner
          fileName={attachedFilePreview.fileName}
          warnings={attachedFilePreview.importWarnings}
          onImport={onImportFile}
          onClear={onClearFile}
        />
      )}

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
            if (file) void onAttachFile(file)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="p-2.5 rounded-xl border border-gray-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 shrink-0 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
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
          onKeyDown={onKeyDown}
          placeholder='e.g. "Explain this spreadsheet" or "Build a monthly budget"'
          aria-label="Message the AI assistant"
        />
        <button
          type="button"
          className="p-2.5 rounded-xl text-white disabled:opacity-40 transition-colors shadow-sm shrink-0"
          style={{ background: 'var(--accent-600)' }}
          onClick={onSend}
          disabled={!chatInput.trim() || isProcessing || !canAsk}
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
  )
}

// ─── LiveStreamRegion ─────────────────────────────────────────────────────────

function LiveStreamRegion({
  streaming,
  message,
  liveIdRef,
  liveLenRef,
}: {
  streaming: boolean
  message: ChatMessageType | undefined
  liveIdRef: React.MutableRefObject<string>
  liveLenRef: React.MutableRefObject<number>
}) {
  let delta = ''
  if (streaming && message?.role === 'assistant') {
    if (message.id !== liveIdRef.current) {
      liveIdRef.current = message.id
      liveLenRef.current = 0
    }
    const content = message.content
    if (content.length > liveLenRef.current) {
      delta = content.slice(liveLenRef.current)
      liveLenRef.current = content.length
    }
  }
  return delta ? <div aria-live="polite" className="sr-only">{delta}</div> : null
}

// ─── AttachmentBanner ─────────────────────────────────────────────────────────

function AttachmentBanner({ fileName, warnings, onImport, onClear }: { fileName: string; warnings?: string[]; onImport: () => void; onClear: () => void }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip size={14} className="text-blue-600 shrink-0" />
          <span className="truncate text-blue-900">{fileName}</span>
          <span className="text-blue-600 shrink-0">attached</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium"
            onClick={() => void onImport()}
          >
            Import
          </button>
          <button
            type="button"
            className="p-1 rounded-md text-blue-700 hover:bg-blue-100"
            onClick={onClear}
            aria-label="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {warnings?.length ? (
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          {warnings.join(' ')}
        </div>
      ) : null}
    </>
  )
}

// ─── MessageContent ───────────────────────────────────────────────────────────

function MessageContent({ content, role, isStreaming }: { content: string; role: string; isStreaming?: boolean }) {
  if (role === 'assistant' && !isStreaming) {
    return <ChatMarkdown content={content} />
  }
  const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|\n)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

const ACTION_STATUS_STYLES: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50',
  applied: 'border-green-200 bg-green-50',
  rejected: 'border-red-200 bg-red-50',
  preview: 'border-blue-200 bg-blue-50',
}

function ActionCard({ action, onApply, onReject }: { action: AgentAction; onApply: () => void; onReject: () => void }) {
  return (
    <div className={`rounded-xl border-2 ${ACTION_STATUS_STYLES[action.status] ?? ''} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-700">{action.description}</p>
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
                {change.description ? (
                  <>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-700 truncate">{change.description}</span>
                  </>
                ) : (
                  <>
                    {change.oldValue != null && (
                      <span className="font-mono text-gray-400 line-through truncate">
                        {String(change.oldValue)}
                      </span>
                    )}
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-700 truncate">
                      {change.newValue != null
                        ? String(change.newValue)
                        : String(change.newFormula ?? '')}
                    </span>
                  </>
                )}
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
            <Check size={12} /> Apply
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-white text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={onReject}
          >
            <XCircle size={12} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ─── PinnedMessagesSection ────────────────────────────────────────────────────

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
