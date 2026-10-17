import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

// A child that throws on demand. Toggling `boom` false lets a re-render recover.
const Boom = ({ boom }: { boom: boolean }) => {
  if (boom) throw new Error("kaboom");
  return <div>recovered content</div>;
};

describe("ErrorBoundary resetKey", () => {
  beforeEach(() => {
    // Silence the expected console.error from componentDidCatch + React's own logging.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the fallback when a child throws", () => {
    render(
      <ErrorBoundary title="boom title" resetKey="/a">
        <Boom boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("boom title")).toBeInTheDocument();
  });

  it("clears the error when resetKey changes (route change), then renders children", () => {
    const { rerender } = render(
      <ErrorBoundary title="boom title" resetKey="/a">
        <Boom boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("boom title")).toBeInTheDocument();

    // Navigate away (resetKey changes) AND the new route's child no longer throws.
    rerender(
      <ErrorBoundary title="boom title" resetKey="/b">
        <Boom boom={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByText("boom title")).not.toBeInTheDocument();
  });

  it("does NOT clear while resetKey is unchanged (same route stays crashed)", () => {
    const { rerender } = render(
      <ErrorBoundary title="boom title" resetKey="/a">
        <Boom boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("boom title")).toBeInTheDocument();

    // Re-render with the SAME resetKey — even if the child would now succeed, the boundary
    // must keep showing the fallback (clearing only happens on an actual route change).
    rerender(
      <ErrorBoundary title="boom title" resetKey="/a">
        <Boom boom={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("boom title")).toBeInTheDocument();
    expect(screen.queryByText("recovered content")).not.toBeInTheDocument();
  });
});
