import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { DashboardStats, UserOffersPage, UserOfferSummary } from "@/types/api";

// Shapes follow backend user.service.ts. The page used to read totalAnalyses / avgScore /
// bestScore / activeOffers (none matched), a top-level totalPages (the backend nests it under
// `pagination`), and company/role fields the list did not return, so tiles read 0, there was no
// pager, and every row showed "—".

const offer = (over: Partial<UserOfferSummary>): UserOfferSummary => ({
  id: "o1", status: "COMPLETED", createdAt: "2026-10-01T00:00:00Z", score: 72, scoreLabel: "good",
  company: "Acme Corp", role: "Backend Engineer", ...over,
});
let stats: DashboardStats;
let pages: Record<number, UserOffersPage>;

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async (url: string, config?: { params?: { page?: number } }) => ({
      data: { data: url.endsWith("/dashboard") ? stats : pages[config?.params?.page ?? 1] },
    })),
  },
}));
// framer-motion's in-view observer needs IntersectionObserver, which jsdom lacks.
vi.mock("@/components/common/MotionCard", () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const { default: DashboardPage } = await import("./DashboardPage");
const { default: api } = await import("@/services/api");

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
};
const page = (offers: UserOfferSummary[], p: number, totalPages: number): UserOffersPage => ({
  offers, pagination: { page: p, limit: 20, total: 25, totalPages },
});
const tile = (label: string) => screen.getByText(label).parentElement!.parentElement!;

beforeEach(() => {
  vi.clearAllMocks();
  stats = { totalOffers: 5, completedAnalyses: 4, averageScore: 68, bestScore: 91 };
  pages = { 1: page([offer({})], 1, 2), 2: page([offer({ id: "o2", company: "Globex", role: "Data Analyst" })], 2, 2) };
});
afterEach(cleanup);

describe("Dashboard stats", () => {
  it("shows the real totals, average and best score", async () => {
    renderPage();
    await screen.findByText("Total Offers");
    await waitFor(() => expect(within(tile("Total Offers")).getByText("5")).toBeTruthy());
    expect(within(tile("Analysed")).getByText("4")).toBeTruthy();
    expect(within(tile("Avg Score")).getByText("68")).toBeTruthy();
    expect(within(tile("Best Score")).getByText("91")).toBeTruthy();
    expect(screen.queryByText("Active Offers")).toBeNull();
  });

  it("shows a dash, not 0, when the user has no scores yet", async () => {
    stats = { totalOffers: 1, completedAnalyses: 0, averageScore: null, bestScore: null };
    renderPage();
    await screen.findByText("Best Score");
    expect(within(tile("Avg Score")).getByText("—")).toBeTruthy();
    expect(within(tile("Best Score")).getByText("—")).toBeTruthy();
  });
});

describe("Dashboard offers table", () => {
  it("shows company and role from the analysis", async () => {
    renderPage();
    expect(await screen.findByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Backend Engineer")).toBeTruthy();
  });

  it("falls back to a dash only when the company is really null", async () => {
    pages = { 1: page([offer({ company: null, role: null })], 1, 1) };
    renderPage();
    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2));
  });

  it("shows the pager from pagination.totalPages, and Next loads page 2", async () => {
    renderPage();
    await screen.findByText("Acme Corp");
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Globex")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/users/me/offers", { params: { page: 2, limit: 20, sort: "createdAt" } });
  });

  it("names an untitled offer's link for screen readers", async () => {
    pages = { 1: page([offer({ company: null })], 1, 1) };
    renderPage();
    const link = await screen.findByRole("link", { name: "Untitled offer" });
    expect(link.getAttribute("href")).toBe("/offers/o1");
  });

  it("hides the pager when there is only one page", async () => {
    pages = { 1: page([offer({})], 1, 1) };
    renderPage();
    await screen.findByText("Acme Corp");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("returns to page 1 when the sort changes", async () => {
    renderPage();
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Globex");
    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/users/me/offers", { params: { page: 1, limit: 20, sort: "score" } }),
    );
  });
});

describe("Dashboard row navigation (FLOW-3)", () => {
  it("a COMPLETED row links to its results", async () => {
    pages = { 1: page([offer({})], 1, 1) };
    renderPage();
    const link = await screen.findByRole("link", { name: "Acme Corp" });
    expect(link.getAttribute("href")).toBe("/offers/o1");
  });

  it.each(["PROCESSING", "QUEUED", "FAILED"] as const)("a %s row links to the processing page", async (status) => {
    pages = { 1: page([offer({ id: "oX", status })], 1, 1) };
    renderPage();
    const link = await screen.findByRole("link", { name: "Acme Corp" });
    expect(link.getAttribute("href")).toBe("/offers/oX/processing");
  });

  it("clicking a FAILED row opens the processing page, not a dead results page", async () => {
    pages = { 1: page([offer({ id: "o9", status: "FAILED" })], 1, 1) };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/offers/:id/processing" element={<div>processing-page</div>} />
            <Route path="/offers/:id" element={<div>results-page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText("Backend Engineer")); // a non-link cell: the row click
    expect(await screen.findByText("processing-page")).toBeTruthy();
    expect(screen.queryByText("results-page")).toBeNull();
  });
});
