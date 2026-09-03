import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          fontFamily: 'monospace',
          minHeight: '100vh'
        }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Something went wrong.
          </h1>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#7f1d1d' }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <details style={{ whiteSpace: 'pre-wrap', marginBottom: '1.5rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Error Details (screenshot for support)
            </summary>
            <code style={{ fontSize: '0.75rem', display: 'block', padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
              {this.state.error && this.state.error.toString()}
              {'\n'}
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </code>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.4rem',
              backgroundColor: '#991b1b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            Hard Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
