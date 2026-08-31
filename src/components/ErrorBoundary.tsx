import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportReactError } from "../lib/errorLog";
import { PRODUCT_NAME } from "../lib/brand";

/**
 * Catches React render crashes.
 *
 * Without this, a throw during render unmounts the whole tree and the visitor gets a blank
 * white page with no explanation — and `window.onerror` does NOT fire for render errors, so
 * we'd never hear about it either.
 *
 * Two jobs: report it, and show the person something that isn't a void. This matters now that
 * the link is public and people open it unattended.
 */

interface Props {
  children: ReactNode;
}
interface State {
  crashed: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportReactError(error, info.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <main className="stage">
        <div className="screen">
          <p className="eyebrow">{PRODUCT_NAME}</p>
          <h1>That didn't work.</h1>
          <p className="lede">
            Something broke on our side, not yours. It's been logged — starting over usually
            clears it.
          </p>
          <div className="row">
            <button className="btn" onClick={() => window.location.reload()}>
              Start over
            </button>
          </div>
        </div>
      </main>
    );
  }
}
