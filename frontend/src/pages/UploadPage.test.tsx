import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { QuotaPlan, QuotaSnapshot } from "@/lib/quota";

// Upload page quota states (task 4.4). The API, auth and page chrome are mocked; the quota
// snapshot is scripted per test.

let snapshot: QuotaSnapshot;
vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async (url: string) => ({ data: { data: url === "/quota" ? snapshot : [] } })),
    post: vi.fn(),
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/layout/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/pdf-extractor", () => ({ extractTextFromFile: vi.fn() }));

const { default: UploadPage } = await import("./UploadPage");
const { default: api } = await import("@/services/api");

const RESET = "2026-10-10T18:30:00.000Z";

function makeSnapshot(plan: QuotaPlan, limit: number | null, used: number): QuotaSnapshot {
  return {
    plan,
    day: "2026-10-10",
    resetAt: RESET,
    accountAnalysesPerDay: 3,
    quotas: {
      analysis: { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) },
      autofill: { limit: 30, used: 0, remaining: 30 },
      career: { limit: 10, used: 0, remaining: 10 },
      negotiation: { limit: 10, used: 0, remaining: 10 },
    },
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Switch to the paste tab and enter enough text to reveal the form and submit button. */
function pasteLetter() {
  // Radix Tabs activate on mousedown with the primary button.
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Paste Text" }), { button: 0 });
  fireEvent.change(screen.getByPlaceholderText(/Paste the text/), {
    target: { value: "This is a long enough offer letter body to count as content." },
  });
}

beforeEach(() => {
  snapshot = makeSnapshot("guest", 1, 0);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("UploadPage quota", () => {
  it("guest with one left: shows the remaining count", async () => {
    renderPage();
    expect(await screen.findByText("1 of 1 analysis left today")).toBeInTheDocument();
  });

  it("guest exhausted: honest copy with reset time and a sign-up link", async () => {
    snapshot = makeSnapshot("guest", 1, 1);
    renderPage();
    const notice = await screen.findByText(/today's free analysis/);
    expect(notice.textContent).toMatch(/IST/);
    expect(notice.textContent).toMatch(/3 analyses a day/);
    expect(screen.getByRole("link", { name: "Create free account" })).toHaveAttribute("href", "/signup");
  });

  it("registered exhausted: 'all 3 analyses today', no sign-up link", async () => {
    snapshot = makeSnapshot("free", 3, 3);
    renderPage();
    const notice = await screen.findByText(/all 3 analyses today/);
    expect(notice.textContent).toMatch(/IST/);
    expect(screen.queryByRole("link", { name: "Create free account" })).not.toBeInTheDocument();
  });

  it("unlimited: no notice", async () => {
    snapshot = makeSnapshot("unlimited", null, 7);
    renderPage();
    // Wait for the quota response to land, so absence is not just "still loading".
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/quota"));
    await act(() => Promise.resolve());
    expect(screen.queryByText(/left today|analyses today|free analysis/)).not.toBeInTheDocument();
  });

  it("exhausted: the submit button is disabled and points at the notice", async () => {
    snapshot = makeSnapshot("free", 3, 3);
    renderPage();
    await screen.findByText(/all 3 analyses today/);
    pasteLetter();
    const button = screen.getByRole("button", { name: "Analyze My Offer" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", "quota-notice");
    expect(document.getElementById("quota-notice")).toBeInTheDocument();
  });

  it("not exhausted: the button is not described by a quota notice", async () => {
    renderPage();
    await screen.findByText("1 of 1 analysis left today");
    pasteLetter();
    expect(screen.getByRole("button", { name: "Analyze My Offer" })).not.toHaveAttribute("aria-describedby");
  });
});

describe("UploadPage model picker", () => {
  it("is shown in development", async () => {
    renderPage();
    pasteLetter();
    expect(screen.getByText("AI Model (Development Only)")).toBeInTheDocument();
  });

  it("is hidden outside development", async () => {
    vi.stubEnv("DEV", false);
    renderPage();
    pasteLetter();
    expect(screen.getByRole("button", { name: "Analyze My Offer" })).toBeInTheDocument();
    expect(screen.queryByText("AI Model (Development Only)")).not.toBeInTheDocument();
  });
});
