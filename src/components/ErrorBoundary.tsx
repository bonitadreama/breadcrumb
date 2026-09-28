import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="startup">
          <h1>This space couldn’t open.</h1>
          <p role="alert">
            Something interrupted reading or displaying your local records. We
            haven’t cleared or reset them.
          </p>
          <p>
            Try reopening the app. Keep your browser data in place while
            investigating.
          </p>
          <button className="primary" onClick={() => location.reload()}>
            Reopen
          </button>
        </main>
      );
    return this.props.children;
  }
}
