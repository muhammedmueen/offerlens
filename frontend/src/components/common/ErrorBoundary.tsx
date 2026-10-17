import { Component, type ErrorInfo, type ReactNode } from "react";
import ErrorState from "@/components/common/ErrorState";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in place of the crashed subtree. */
  title?: string;
  /**
   * When this value changes, the boundary clears its error and re-renders children. Used to
   * auto-recover on route change without remounting the boundary (route-level usage passes
   * the pathname). Remounting via `key` would also reset it, but this boundary must stay
   * mounted so the Suspense boundary above it keeps its committed content and navigation
   * transitions can hold the previous page instead of flashing the fallback.
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** The resetKey value the current error was captured under, so we only clear on change. */
  resetKey?: string;
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

  // Snapshot the resetKey the error was captured under, so we only clear once it CHANGES.
  // Comparing against the live prop (rather than clearing whenever they differ) is what keeps
  // a first-paint crash from looping: the captured key equals the current key at capture, so
  // the error persists until an actual route change moves resetKey.
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  // Clear the error when resetKey changes (e.g. route change), so navigating away from a
  // crashed page recovers it without remounting the boundary.
  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (state.error && state.resetKey !== undefined && props.resetKey !== state.resetKey) {
      return { error: null, resetKey: undefined };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Record which route this crash belongs to, so a later navigation (changed resetKey)
    // clears it. Done here, not in getDerivedStateFromError, because only props seen here
    // give the capture-time key.
    this.setState({ resetKey: this.props.resetKey });
    // Keep the stack in the console. Nothing ships errors anywhere yet, so losing this
    // would make the fallback strictly worse than the crash for debugging.
    console.error("[ErrorBoundary]", this.props.title ?? "render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={this.props.title ?? "Something went wrong displaying this section."}
          onRetry={() => this.setState({ error: null, resetKey: undefined })}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
