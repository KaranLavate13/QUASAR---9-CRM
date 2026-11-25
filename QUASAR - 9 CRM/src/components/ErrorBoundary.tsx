import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('QUASAR-9 CRM ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error && parsed.operationType) {
          displayMessage = `Workspace sync error during ${parsed.operationType} on ${parsed.path || 'data'}: ${parsed.error}`;
        }
      } catch {
        // Keep raw message if not JSON
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="liquid-elevated max-w-lg rounded-2xl p-8">
            <div className="mb-4 flex items-center gap-3 text-red-500">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-semibold">Workspace Recovery Required</h2>
            </div>
            <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {displayMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-foreground)',
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
