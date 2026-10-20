import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// MONEY-1 / MONEY-5: the take-home section says "up to" when basic pay is unknown, keeps variable
// pay out of the monthly figure, labels the CTC tile honestly, and still renders rows stored in
// the OLD shape (without claiming they are exact). Harness copied from ResultsPage.salary.test.tsx.

vi.mock("@/store/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/motion/Reveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => <div>{p.children as React.ReactNode}</div> }),
  useReducedMotion: () => true,
}));
vi.mock("@/components/charts/ScoreGauge", () => ({ default: () => <div data-testid="gauge" /> }));
vi.mock("@/components/charts/SalaryBar", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/NegotiationPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/BenefitsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CareerPathPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/offers/CorrectionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/salary/ContributeSalaryCard", () => ({ default: () => <div /> }));

const apiGet = vi.fn();
vi.mock("@/services/api", () => ({ default: { get: (...a: unknown[]) => apiGet(...a) } }));

const { default: ResultsPage } = await import("./ResultsPage");

const tax = { grossAnnual: 1_135_140, taxableIncome: 1_060_140, incomeTax: 0, surcharge: 0, cess: 0, totalTax: 0, effectiveRate: 0 };

/** New shape, basic known: the hand-worked ₹12L CTC / ₹6L basic case (91,595 / 85,595). */
const knownBasic = {
  regime: "new", rulesVersion: "FY2026-27", tax,
  employeePf: { statutoryMinimum: 36_000, onFullBasic: 72_000 },
  employerPf: { statutoryMinimum: 36_000, onFullBasic: 72_000 },
  gratuity: 28_860,
  netMonthly: { high: 91_595, low: 85_595 },
  isExact: false, isUpperBound: false, ctcAnnual: 1_200_000, variableAnnual: null,
  assumptions: ["New tax regime."],
};

/** New shape, CTC only: an upper bound with no PF numbers. */
const unknownBasic = {
  ...knownBasic,
  tax: { ...tax, grossAnnual: 2_400_000, totalTax: 292_500, effectiveRate: 0.122 },
  employeePf: { statutoryMinimum: null, onFullBasic: null },
  employerPf: { statutoryMinimum: null, onFullBasic: null },
  gratuity: null,
  netMonthly: { high: 175_625, low: 175_625 },
  isExact: false, isUpperBound: true, ctcAnnual: 2_400_000,
};

/** The shape stored before this fix: no isUpperBound / ctcAnnual / employerPf / variableAnnual / gratuity. */
const oldShape = {
  regime: "new", rulesVersion: "FY2026-27",
  tax: { ...tax, grossAnnual: 2_400_000, totalTax: 292_500, effectiveRate: 0.122 },
  employeePf: { statutoryMinimum: null, onFullBasic: null },
  netMonthly: { high: 175_625, low: 175_625 },
  isExact: true,
  assumptions: ["New tax regime."],
};

const analysisWith = (takeHome: Record<string, unknown>) => ({
  score: 72,
  scoreLabel: "solid",
  extractedData: { companyName: "Acme", role: "Backend Engineer", location: "Pune", compensation: { totalCTC: 2_400_000 } },
  redFlags: [],
  benefits: [],
  negotiationSuggestions: [],
  salaryComparison: null,
  takeHome,
});

const renderPage = async (takeHome: Record<string, unknown>) => {
  apiGet.mockResolvedValue({ data: { data: analysisWith(takeHome) } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/offers/o1"]}>
        <Routes>
          <Route path="/offers/:id" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Estimated Take-Home");
};

const tile = (label: string) => screen.getByText(label).parentElement!.textContent;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResultsPage take-home (MONEY-1, MONEY-5)", () => {
  it("unknown basic: 'up to', with a visible note outside the collapsed assumptions", async () => {
    await renderPage(unknownBasic);

    expect(screen.getByText("up to ₹1,75,625")).toBeTruthy();
    const note = screen.getByText(/Upper bound\. Your letter doesn't state basic pay/);
    expect(note.closest("details")).toBeNull();
    expect(note.textContent).toContain("lower, depending on your basic-pay split");
    // No bare exact figure, no range, no invented PF number.
    expect(screen.queryByText("₹1,75,625")).toBeNull();
    expect(screen.queryByText(/A range, because PF/)).toBeNull();
    expect(tile("Employee PF")).toContain("Depends on your basic pay");
    expect(document.body.textContent).not.toMatch(/NaN|null/);
  });

  it("known basic: a low-high range, and the PF tile shows the same kind of range", async () => {
    await renderPage(knownBasic);

    expect(screen.getByText("₹85,595 – ₹91,595")).toBeTruthy();
    expect(screen.getByText(/A range, because PF/)).toBeTruthy();
    expect(screen.queryByText(/up to/)).toBeNull();
    expect(tile("Employee PF")).toContain("₹36,000 – ₹72,000");
  });

  it("known basic under the ceiling: one exact figure and one PF number", async () => {
    await renderPage({
      ...knownBasic,
      employeePf: { statutoryMinimum: 28_800, onFullBasic: 28_800 },
      netMonthly: { high: 44_238, low: 44_238 },
      isExact: true,
    });

    expect(screen.getByText("₹44,238")).toBeTruthy();
    expect(tile("Employee PF")).toContain("₹28,800");
    expect(tile("Employee PF")).not.toContain("–");
  });

  it("shows variable pay separately, not in the monthly figure", async () => {
    await renderPage({ ...knownBasic, variableAnnual: 240_000 });

    expect(screen.getByText("plus up to ₹2,40,000 per year variable (not included)")).toBeTruthy();
  });

  it("labels the first tile 'CTC (annual)', never 'Gross (annual)'", async () => {
    await renderPage(knownBasic);

    expect(tile("CTC (annual)")).toContain("₹12,00,000");
    expect(screen.queryByText("Gross (annual)")).toBeNull();
  });

  it("renders an OLD-shape stored row without crashing and without claiming it is exact", async () => {
    await renderPage(oldShape);

    // isExact is true in the old row, but a missing isUpperBound means 'up to'.
    expect(screen.getByText("up to ₹1,75,625")).toBeTruthy();
    expect(screen.queryByText("₹1,75,625")).toBeNull();
    expect(screen.getByText(/older estimate/).closest("details")).toBeNull();
    // Falls back to tax.grossAnnual (equal to the CTC in old rows) and has no variable line.
    expect(tile("CTC (annual)")).toContain("₹24,00,000");
    expect(screen.queryByText(/variable \(not included\)/)).toBeNull();
    expect(tile("Employee PF")).toContain("Depends on your basic pay");
    expect(document.body.textContent).not.toMatch(/NaN|null|undefined/);
  });
});
