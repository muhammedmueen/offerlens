import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { POLLING_INTERVAL_MS } from "@/constants/api";

// The bug: the poll's stop predicate read query.state.data?.status, which is undefined on an
// errored tick, so it never returned false — the 3s interval ran forever and the global
// retry:1 doubled every failed tick into a request storm. The fix stops on terminal state AND
// on error, disables retry for this query, and hard-caps total polling at 5 min.

vi.mock("@/services/api", () => ({ default: { get: vi.fn() } }));
// useAuth throws without its provider; the flag lets a test render as a guest.
let authed = true;
vi.mock("@/store/auth", () => ({ useAuth: () => ({ isAuthenticated: authed }) }));
vi.mock("@/components/layout/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const { default: api } = await import("@/services/api");
const { default: ProcessingPage } = await import("./ProcessingPage");
const get = api.get as ReturnType<typeof vi.fn>;

// react-query's global default on this app is retry:1 — mirror it so the test proves the
// per-query retry:false actually overrides it rather than silently agreeing with a lenient default.
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 1 } } })}>
      <MemoryRouter initialEntries={["/offers/abc/processing"]}>
        <Routes>
          <Route path="/offers/:id/processing" element={<ProcessingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

// Advance both the real-query interval and the 1s elapsed ticker.
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  navigate.mockReset();
  authed = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  cleanup();
});

describe("ProcessingPage polling", () => {
  it("keeps polling at the interval while PROCESSING", async () => {
    get.mockResolvedValue({ data: { data: { status: "PROCESSING" } } });
    renderPage();
    await advance(0); // initial fetch
    const afterFirst = get.mock.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    await advance(POLLING_INTERVAL_MS * 3);
    // One tick per interval, no doubling from retry.
    expect(get.mock.calls.length).toBeGreaterThan(afterFirst);
    expect(get.mock.calls.length).toBeLessThanOrEqual(afterFirst + 4);
  });

  it("stops on COMPLETED and navigates to the offer", async () => {
    get.mockResolvedValue({ data: { data: { status: "COMPLETED" } } });
    renderPage();
    await advance(0);
    const calls = get.mock.calls.length;
    await advance(POLLING_INTERVAL_MS * 3);
    expect(get.mock.calls.length).toBe(calls); // no further polls
    expect(navigate).toHaveBeenCalledWith("/offers/abc", { replace: true });
  });

  it("stops on FAILED and shows the failure UI", async () => {
    get.mockResolvedValue({ data: { data: { status: "FAILED", failureReason: "AI_ERROR: boom" } } });
    renderPage();
    await advance(0);
    const calls = get.mock.calls.length;
    await advance(POLLING_INTERVAL_MS * 3);
    expect(get.mock.calls.length).toBe(calls);
    expect(screen.getByText("Analysis Failed")).toBeTruthy();
  });

  it("stops on an errored poll instead of refiring forever (no retry doubling)", async () => {
    get.mockRejectedValue({ response: { status: 404, data: { error: { code: "NOT_FOUND" } } } });
    renderPage();
    await advance(0);
    await advance(POLLING_INTERVAL_MS * 10);
    // Bounded: one failed fetch (retry:false), then the predicate stops the interval. Without
    // the fix this would be dozens of calls.
    expect(get.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("hard-caps polling at 5 minutes and shows the give-up message", async () => {
    get.mockResolvedValue({ data: { data: { status: "PROCESSING" } } });
    renderPage();
    await advance(0);
    await advance(300_000); // 5 min
    const callsAtCap = get.mock.calls.length;
    expect(
      screen.getByText(/taking longer than expected/i).textContent,
    ).toMatch(/check your dashboard/i);
    expect(screen.getByRole("button", { name: "Go to Dashboard" })).toBeTruthy();
    // Query is disabled after the cap — no new polls.
    await advance(POLLING_INTERVAL_MS * 5);
    expect(get.mock.calls.length).toBe(callsAtCap);
  });

  it("FAILED heading is the page h1", async () => {
    get.mockResolvedValue({ data: { data: { status: "FAILED", failureReason: "AI_ERROR: boom" } } });
    renderPage();
    await advance(0);
    expect(screen.getByRole("heading", { level: 1, name: "Analysis Failed" })).toBeTruthy();
  });

  it("rate-limit FAILED in a production build gives no model-selector advice (the selector is dev-only)", async () => {
    vi.stubEnv("DEV", false);
    get.mockResolvedValue({ data: { data: { status: "FAILED", failureReason: "RATE_LIMIT: Too many requests" } } });
    renderPage();
    await advance(0);
    expect(screen.getByText("Wait 2-3 minutes before trying again")).toBeTruthy();
    expect(screen.queryByText(/model selector/i)).toBeNull();
    expect(screen.queryByText(/different AI model/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Change Model" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
  });

  it("rate-limit FAILED in a dev build keeps the model-selector advice", async () => {
    vi.stubEnv("DEV", true);
    get.mockResolvedValue({ data: { data: { status: "FAILED", failureReason: "RATE_LIMIT: Too many requests" } } });
    renderPage();
    await advance(0);
    expect(screen.getByText("Use the model selector in the upload form")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change Model" })).toBeTruthy();
  });

  it("FAILED shows the stored failure reason without its prefix", async () => {
    get.mockResolvedValue({ data: { data: { status: "FAILED", failureReason: "AI_ERROR: The model timed out" } } });
    renderPage();
    await advance(0);
    expect(screen.getByText("The model timed out")).toBeTruthy();
  });
});

describe("ProcessingPage give-up for a guest (FLOW-3)", () => {
  it("offers no dashboard, and Check again resumes polling", async () => {
    authed = false;
    get.mockResolvedValue({ data: { data: { status: "PROCESSING" } } });
    renderPage();
    await advance(0);
    await advance(300_000);
    expect(screen.getByText(/taking longer than expected/i)).toBeTruthy();
    expect(screen.queryByText(/dashboard/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /dashboard/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();

    const callsAtCap = get.mock.calls.length;
    await act(async () => {
      screen.getByRole("button", { name: "Check again" }).click();
    });
    await advance(POLLING_INTERVAL_MS);
    expect(get.mock.calls.length).toBeGreaterThan(callsAtCap);
    expect(screen.queryByText(/taking longer than expected/i)).toBeNull();
  });
});
