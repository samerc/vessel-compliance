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
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
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
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-primary)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
