import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// MONEY-2: no invented "50th percentile" over four ₹0 bars, including rows stored before the fix.
// MONEY-9: real ordinals. FLOW-3: a 404 is a not-ready state, not a retry that cannot work.
// Harness copied from ResultsPage.negotiate-gate.test.tsx.

vi.mock("@/store/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/motion/Reveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => <div>{p.children as React.ReactNode}</div> }),
  useReducedMotion: () => true,
}));
vi.mock("@/components/charts/ScoreGauge", () => ({ default: () => <div data-testid="gauge" /> }));
// Renders its props, so the test can see the bars and the label it was given.
vi.mock("@/components/charts/SalaryBar", () => ({
  default: (p: { label?: string; p25: number; p50: number; p75: number; p90: number }) => (
    <div data-testid="salary">{p.label ?? "no-label"}|{[p.p25, p.p50, p.p75, p.p90].join(",")}</div>
  ),
}));
vi.mock("@/components/offers/NegotiationPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/BenefitsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CareerPathPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CorrectionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/salary/ContributeSalaryCard", () => ({ default: () => <div /> }));

const apiGet = vi.fn();
vi.mock("@/services/api", () => ({ default: { get: (...a: unknown[]) => apiGet(...a) } }));

const { default: ResultsPage } = await import("./ResultsPage");

const REAL_RANGE = { p25: 1_800_000, p50: 2_300_000, p75: 2_800_000, p90: 3_300_000 };
const NULL_RANGE = { p25: null, p50: null, p75: null, p90: null };

const analysisWith = (salaryComparison: Record<string, unknown>, totalCTC: number | null = 2_400_000) => ({
  score: 72,
  scoreLabel: "solid",
  extractedData: { companyName: "Acme", role: "Backend Engineer", location: "Pune", compensation: { totalCTC } },
  redFlags: [],
  benefits: [],
  negotiationSuggestions: [],
  salaryComparison: { roleUsed: "Backend Engineer", locationUsed: "Pune", disclaimer: null, ...salaryComparison },
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/offers/o1"]}>
        <Routes>
          <Route path="/offers/:id" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const loaded = () => screen.findByText("Red Flags");
const noNullOrNaN = () => expect(document.body.textContent).not.toMatch(/NaN|null/);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResultsPage salary comparison (MONEY-2, MONEY-9)", () => {
  it("hides the section for an AI estimate with no range or percentile (the MONEY-2 repro)", async () => {
    apiGet.mockResolvedValue({
      data: { data: analysisWith({ dataSource: "ai_estimated", offerPercentile: null, marketRange: NULL_RANGE }, null) },
    });
    renderPage();
    await loaded();
    expect(screen.queryByTestId("salary")).toBeNull();
    expect(screen.queryByText("Salary Comparison")).toBeNull();
    expect(document.body.textContent).not.toMatch(/50th percentile/);
    noNullOrNaN();
  });

  it("hides a legacy stored row (ai_estimated, 50, all-zero range)", async () => {
    apiGet.mockResolvedValue({
      data: { data: analysisWith({ dataSource: "ai_estimated", offerPercentile: 50, marketRange: { p25: 0, p50: 0, p75: 0, p90: 0 } }) },
    });
    renderPage();
    await loaded();
    expect(screen.queryByTestId("salary")).toBeNull();
    expect(document.body.textContent).not.toMatch(/percentile/);
    noNullOrNaN();
  });

  it("shows a real AI-estimated range, but never the model's own percentile", async () => {
    apiGet.mockResolvedValue({
      data: { data: analysisWith({ dataSource: "ai_estimated", offerPercentile: 55, marketRange: REAL_RANGE }) },
    });
    renderPage();
    const bar = await screen.findByTestId("salary");
    expect(bar.textContent).toBe("no-label|1800000,2300000,2800000,3300000");
    noNullOrNaN();
  });

  it.each([
    ["crowdsourced", 22, "Your offer is at the 22nd percentile"],
    ["public_survey", 41.666666666666664, "Your offer is at the 42nd percentile"],
    ["crowdsourced", 0, "Your offer is at the 0th percentile"],
  ])("a %s benchmark at %s reads %s", async (dataSource, offerPercentile, label) => {
    apiGet.mockResolvedValue({
      data: { data: analysisWith({ dataSource, offerPercentile, marketRange: REAL_RANGE, sampleSize: 12 }) },
    });
    renderPage();
    const bar = await screen.findByTestId("salary");
    expect(bar.textContent).toBe(`${label}|1800000,2300000,2800000,3300000`);
    noNullOrNaN();
  });

  it("a withheld percentile shows the range with no label", async () => {
    apiGet.mockResolvedValue({
      data: {
        data: analysisWith({
          dataSource: "public_survey", offerPercentile: null, percentileWithheld: "no_experience_rows", marketRange: REAL_RANGE, sampleSize: 40,
        }),
      },
    });
    renderPage();
    const bar = await screen.findByTestId("salary");
    expect(bar.textContent?.startsWith("no-label|")).toBe(true);
    noNullOrNaN();
  });
});

describe("ResultsPage when the analysis is not available (FLOW-3)", () => {
  it("a 404 shows the not-ready state with a link to the processing page and no retry", async () => {
    apiGet.mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(await screen.findByRole("heading", { name: "This analysis isn't ready or isn't available" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check its progress" }).getAttribute("href")).toBe("/offers/o1/processing");
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
  });

  it("any other error keeps the generic retry state", async () => {
    apiGet.mockRejectedValue({ response: { status: 500 } });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Try again/i })).toBeTruthy();
  });
});
