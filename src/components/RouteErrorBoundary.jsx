import { Component } from 'react';

export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-desk-lg border border-red-800/50 bg-red-950/30 p-6 text-red-100">
          <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
          <pre className="mb-4 max-h-40 overflow-auto font-mono text-xs text-red-200/90">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            className="rounded-desk-md border border-red-600/50 bg-red-900/40 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-900/60"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
