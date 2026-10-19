import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RATE_LIMITED_TEXT } from "@/lib/quota";

// CAR-1: a permanent client error (400 'role not identified') must fail IMMEDIATELY with no
// retries and show a meaningful message with NO retry button; transient errors still retry
// and keep the retry button.
vi.mock("@/services/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/charts/CareerTimeline", () => ({ default: () => <div data-testid="timeline" /> }));
vi.mock("@/components/offers/CareerProgression", () => ({ default: () => <div data-testid="progression" /> }));

const { default: api } = await import("@/services/api");
const { default: CareerPathPanel } = await import("./CareerPathPanel");

const ROLE_NOT_IDENTIFIED = {
  response: { status: 400, data: { error: { code: "INVALID_INPUT", message: "Cannot generate career path: Role not identified in offer" } } },
};
const serverError = { response: { status: 500, data: { error: { code: "INTERNAL" } } } };
const rateLimit = { response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED" } } } };
const quotaExhausted = {
  response: {
    status: 429,
    data: {
      error: {
        code: "QUOTA_EXCEEDED",
        details: { feature: "career", limit: 3, used: 3, remaining: 0, resetAt: "2025-01-01T00:00:00Z", plan: "free" },
      },
    },
  },
};

const renderPanel = () =>
  render(
    // The panel sets its own `retry` predicate, so the client's `retry: false` is ignored for
    // that query — pin `retryDelay: 0` so any transient retries resolve instantly rather than
    // running out the exponential backoff past waitFor's timeout.
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })}
    >
      <CareerPathPanel offerId="o1" />
    </QueryClientProvider>,
  );

const NO_ROLE = /doesn't name an identifiable role/i;

afterEach(() => {
  cleanup();
  vi.mocked(api.get).mockReset();
});

describe("CareerPathPanel permanent error (CAR-1)", () => {
  it("a 400 'role not identified' fires NO retries: the fetch is called exactly once", async () => {
    vi.mocked(api.get).mockRejectedValue(ROLE_NOT_IDENTIFIED);
    renderPanel();

    await waitFor(() => expect(screen.getByText(NO_ROLE)).toBeTruthy());
    // The core CAR-1 guard: one call, not 1 + 3 retries.
    expect(api.get).toHaveBeenCalledTimes(1);
    // No dead retry button — refetching would just hit the same permanent 400.
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
  });
});

describe("CareerPathPanel transient error (CAR-1 preserves the legitimate retry path)", () => {
  it("a 500 shows a generic error WITH a retry button", async () => {
    vi.mocked(api.get).mockRejectedValue(serverError);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeTruthy());
    // Retry is offered because a refetch can plausibly succeed.
    expect(screen.getByRole("button", { name: /Try again/i })).toBeTruthy();
    // Not the no-role copy.
    expect(screen.queryByText(NO_ROLE)).toBeNull();
    // A transient error is retried (default count of 3), so the fetch runs more than once.
    expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(1);
  });
});

describe("CareerPathPanel 429 handling (CAR-1 does not regress the quota convention)", () => {
  it("a rate-limit 429 shows the rate-limit text with a retry button", async () => {
    vi.mocked(api.get).mockRejectedValue(rateLimit);
    renderPanel();

    await waitFor(() => expect(screen.getByText(RATE_LIMITED_TEXT)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Try again/i })).toBeTruthy();
  });

  it("an exhausted-quota 429 shows the quota text with NO retry button and no retries", async () => {
    vi.mocked(api.get).mockRejectedValue(quotaExhausted);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/reached today's limit of 3 career paths/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
    // A daily-limit 429 cannot clear before reset, so it is not retried.
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
