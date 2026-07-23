import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional fallback UI. If omitted, uses the default crash screen. */
  fallback?: ReactNode
  /** Optional scope label shown in the fallback (e.g., "Spreadsheet Grid"). */
  scope?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Catches uncaught errors in the React tree below and renders a recovery UI
 * instead of a blank white screen. Wrap around <App /> and optionally around
 * high-risk subtrees (SpreadsheetGrid, ChatPanel, etc.).
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console — replace with Sentry/reporting when available
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleRecover = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const scope = this.props.scope || 'Application'

      return (
        <div className="flex items-center justify-center min-h-[200px] w-full p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-4xl">💥</div>
            <h2 className="text-lg font-semibold text-gray-800">
              {scope} crashed
            </h2>
            <p className="text-sm text-gray-600">
              Something went wrong. Your data is safe — it's saved locally.
            </p>
            {this.state.error && (
              <details className="text-left text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-32 overflow-auto">
                <summary className="cursor-pointer text-gray-500 font-medium">
                  Error details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-red-700">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleRecover}
                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Try to recover
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
