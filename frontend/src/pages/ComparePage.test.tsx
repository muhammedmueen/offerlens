import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserOffersPage } from "@/types/api";

// The list endpoint nests offers under `offers` and now carries company/role. The page showed
// "Unknown — Role" for every row because those fields were never returned.
const base = { createdAt: "2026-10-01T00:00:00Z", scoreLabel: "good" };
const data: UserOffersPage = {
  offers: [
    { ...base, id: "a", status: "COMPLETED", score: 80, company: "Acme Corp", role: "Backend Engineer" },
    { ...base, id: "b", status: "COMPLETED", score: 65, company: "Globex", role: "Data Analyst" },
    { ...base, id: "c", status: "PROCESSING", score: null, scoreLabel: null, company: null, role: null },
  ],
  pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
};

vi.mock("@/services/api", () => ({ default: { get: vi.fn(async () => ({ data: { data } })), post: vi.fn() } }));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/common/EmptyState", () => ({ default: () => <div>empty</div> }));

const { default: ComparePage } = await import("./ComparePage");

afterEach(cleanup);

describe("ComparePage offer list", () => {
  it("names each completed offer by company and role, and leaves out unfinished ones", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ComparePage /></QueryClientProvider>);
    expect(await screen.findByText("Acme Corp — Backend Engineer")).toBeTruthy();
    expect(screen.getByText("Globex — Data Analyst")).toBeTruthy();
    expect(screen.queryByText(/Unknown/)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
