import React from "react";

/**
 * Catches render errors so a single broken page shows a message instead of a
 * blank window. Recovery is a full reload, which with hash routing returns to
 * the same screen.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Phoenix] render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-phx-surface flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-sm text-phx-secondary mb-4">
            The page could not be rendered. The backend and your case data are unaffected.
          </p>
          <pre className="text-xs font-mono bg-phx-surface border border-phx-border rounded p-3 overflow-auto max-h-40 mb-4">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
