import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console so devs can see it
    console.error('🚨 ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Force a clean reload to recover from broken state
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
        }}>
          <div style={{
            maxWidth: '480px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
          }}>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f87171' }}>
              ⚠️ Algo se rompió
            </h1>
            <p style={{ margin: '0 0 1rem', color: '#cbd5e1' }}>
              La aplicación tuvo un error inesperado. Ya lo reportamos en la consola.
            </p>
            <details style={{ marginBottom: '1.5rem' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>
                Detalles técnicos
              </summary>
              <pre style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                fontSize: '0.75rem',
                overflow: 'auto',
                color: '#fbbf24',
              }}>
                {this.state.error?.toString() || 'Error desconocido'}
              </pre>
            </details>
            <button
              onClick={this.handleReset}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
              }}
            >
              🔄 Volver al Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
