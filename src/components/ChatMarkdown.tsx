import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { memo } from 'react'

const markdownComponents: Components = {
  // Code blocks and inline code
  code({ className, children, node, ...props }) {
    // Detect block code: react-markdown wraps fenced blocks in <pre><code>
    // Check if parent is <pre> by looking at node position or className
    const isBlock = className?.startsWith('language-') || (node?.position && String(children).includes('\n'))
    if (isBlock) {
      return (
        <pre className="my-2 rounded-lg bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto">
          <code className={className} {...props}>{children}</code>
        </pre>
      )
    }
    return (
      <code className="px-1 py-0.5 rounded bg-gray-200 text-gray-800 text-[12px] font-mono" {...props}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    // Let the code block handle its own <pre> styling
    return <>{children}</>
  },
  // Tables
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-gray-300">
        <table className="min-w-full text-xs">{children}</table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-gray-200/60 text-gray-700 font-medium">{children}</thead>
  },
  th({ children }) {
    return <th className="px-2 py-1.5 text-left border-b border-gray-300">{children}</th>
  },
  td({ children }) {
    return <td className="px-2 py-1.5 border-b border-gray-200">{children}</td>
  },
  // Lists
  ul({ children }) {
    return <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
  },
  ol({ children }) {
    return <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
  },
  li({ children }) {
    return <li className="text-sm leading-relaxed">{children}</li>
  },
  // Headings
  h1({ children }) {
    return <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-sm font-bold mt-2.5 mb-1">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mt-2 mb-0.5">{children}</h3>
  },
  // Paragraphs
  p({ children }) {
    return <p className="mb-1.5 last:mb-0">{children}</p>
  },
  // Links
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
        {children}
      </a>
    )
  },
  // Blockquotes
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-4 border-blue-300 pl-3 text-gray-600 italic">
        {children}
      </blockquote>
    )
  },
  // Horizontal rules
  hr() {
    return <hr className="my-2 border-gray-300" />
  },
}

/**
 * Renders markdown content for assistant messages.
 * Memoized to avoid re-parsing on parent re-renders when content hasn't changed.
 */
export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
})
