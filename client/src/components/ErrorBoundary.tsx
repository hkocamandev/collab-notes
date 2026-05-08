import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="page-center">
          <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: '2rem' }}>
            <p style={{ marginTop: 0, fontWeight: 600 }}>Something went wrong</p>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={this.handleReset}>
                Try again
              </button>
              <button className="btn-secondary" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
