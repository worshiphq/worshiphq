import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * If something on screen breaks, show a calm "Reload" panel instead of a blank window. The projector window is
 * separate, so what is on the church screen stays there while the operator reloads.
 */
export class SafetyNet extends Component<{ children: ReactNode; quiet?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("WorshipHQ Live hit a problem:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // The projector, stage and livestream windows: just stay dark rather than show a message on the church screen.
    if (this.props.quiet) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-ink">Something went wrong on this screen</h2>
          <p className="mt-2 text-sm text-ink-muted">
            What is on the projector stays there. Press Reload to carry on; your songs, schedule and settings are safe.
          </p>
          <button onClick={() => window.location.reload()}
            className="mt-5 h-11 w-full rounded-lg bg-primary text-[15px] font-bold text-white hover:bg-primary-bright">
            Reload
          </button>
          <p className="mt-3 break-words font-mono text-[11px] text-ink-faint">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
