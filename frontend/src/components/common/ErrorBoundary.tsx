import { Component, type ErrorInfo, type ReactNode } from "react";
import ErrorState from "@/components/common/ErrorState";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in place of the crashed subtree. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in a subtree and shows a recoverable message instead of unmounting
 * the whole app.
 *
 * There was no boundary anywhere in the tree. A single missing field in AI-derived JSON
 * (`milestone.skills.map()` where the API never sends `skills`) took the entire results
 * page to a white screen — React's own console output asked for exactly this.
 *
 * Must be a class: `componentDidCatch` has no hook equivalent. Reuses `ErrorState` for the
 * fallback so the styling matches every other failure surface.
 *
 * Reset semantics: "Try again" clears the error and re-renders the subtree, which is enough
 * for transient failures. For a persistent bug the subtree throws again immediately and the
 * fallback returns — deliberate, since silently swallowing it would hide the bug. Route-level
 * boundaries are keyed on pathname, so navigation clears the state.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the stack in the console. Nothing ships errors anywhere yet, so losing this
    // would make the fallback strictly worse than the crash for debugging.
    console.error("[ErrorBoundary]", this.props.title ?? "render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={this.props.title ?? "Something went wrong displaying this section."}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
