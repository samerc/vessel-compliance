import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  // 'page' = contained fallback inside the main area (sidebar and other pages keep working);
  // 'app' (default) = full-screen fallback for the whole window
  variant?: 'app' | 'page'
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  /** React component stack, for the copied details */
  componentStack?: string
  copied?: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
    this.copyDetails = this.copyDetails.bind(this)
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.setState({ componentStack: errorInfo.componentStack || undefined })
  }

  // Everything support needs, as plain text for an email or chat
  copyDetails(): void {
    const e = this.state.error
    const text = [
      `Error: ${e?.message || 'unknown'}`,
      `When: ${new Date().toISOString()}`,
      `Page: ${document.title}`,
      `App: ${navigator.userAgent}`,
      '',
      e?.stack || '',
      this.state.componentStack ? `\nComponents:${this.state.componentStack}` : ''
    ].join('\n')
    navigator.clipboard
      .writeText(text)
      .then(() => this.setState({ copied: true }))
      .catch(() => {})
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: this.props.variant === 'page' ? 'auto' : '100vh',
            minHeight: this.props.variant === 'page' ? '50vh' : undefined,
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-primary)',
            background: this.props.variant === 'page' ? 'transparent' : 'var(--bg-dark)'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 77, 77, 0.15)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              fontSize: '28px'
            }}
          >
            !
          </div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '1.4rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 0 8px 0' }}>
            {this.props.variant === 'page'
              ? 'This page hit an unexpected error. You can try again or open another page from the menu.'
              : 'The application encountered an unexpected error.'}
          </p>
          {this.state.error && (
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                maxWidth: '500px',
                margin: '0 0 24px 0',
                opacity: 0.7
              }}
            >
              {this.state.error.message}
            </p>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn-primary"
              onClick={() => this.setState({ hasError: false, error: null, copied: false })}
            >
              Try Again
            </button>
            <button className="btn-secondary" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <button className="btn-secondary" onClick={this.copyDetails}>
              {this.state.copied ? 'Details copied' : 'Copy error details'}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
