import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// NEG-3: the "Generate Negotiation Email" affordance must be present even when the analysis
// carries NO negotiation suggestions — a thin-data offer still gets the backend's template email.

const OFFER_ID = "o1";

// Authenticated so the button renders without a lock, and so requireAuth would open the drawer
// (we only assert the button's presence here).
vi.mock("@/store/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));

// Reveal wraps blocks in framer-motion's whileInView, which needs IntersectionObserver (absent
// in jsdom). Collapse it to a plain section/div so the page renders without a browser observer.
vi.mock("@/components/motion/Reveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The Red Flags section uses framer-motion directly; stub motion to plain elements.
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => <div>{p.children as React.ReactNode}</div> }),
  useReducedMotion: () => true,
}));

// Keep the render light: stub the heavy chart/panel children the gate does not depend on.
vi.mock("@/components/charts/ScoreGauge", () => ({ default: () => <div data-testid="gauge" /> }));
vi.mock("@/components/charts/SalaryBar", () => ({ default: () => <div data-testid="salary" /> }));
vi.mock("@/components/offers/NegotiationPanel", () => ({ default: () => <div data-testid="neg-panel" /> }));
vi.mock("@/components/offers/BenefitsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CareerPathPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CorrectionsPanel", () => ({ default: () => <div /> }));

const apiGet = vi.fn();
vi.mock("@/services/api", () => ({ default: { get: (...a: unknown[]) => apiGet(...a) } }));

const { default: ResultsPage } = await import("./ResultsPage");

const analysisWithNoTips = {
  score: 72,
  scoreLabel: "solid",
  extractedData: { companyName: "Acme", role: "Backend Engineer", location: "Pune" },
  redFlags: [],
  benefits: [],
  negotiationSuggestions: [],
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/offers/${OFFER_ID}`]}>
        <Routes>
          <Route path="/offers/:id" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResultsPage negotiation gate (NEG-3)", () => {
  it("shows the Generate Negotiation Email button even with zero negotiation tips", async () => {
    apiGet.mockResolvedValue({ data: { data: analysisWithNoTips } });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Generate Negotiation Email/i })).toBeTruthy(),
    );
  });
});
