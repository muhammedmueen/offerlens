import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/charts/SalaryBar", () => ({ default: () => <div data-testid="salary-bar" /> }));
const { default: api } = await import("@/services/api");
const { default: SalaryExplorerPage } = await import("./SalaryExplorerPage");

const get = api.get as ReturnType<typeof vi.fn>;
const search = async (data: object) => {
  get.mockResolvedValue({ data: { data } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SalaryExplorerPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByPlaceholderText(/Role/), { target: { value: "Backend Engineer" } });
  fireEvent.change(screen.getByPlaceholderText(/City/), { target: { value: "Pune" } });
  fireEvent.click(screen.getByRole("button", { name: /Search/ }));
};
afterEach(cleanup);

describe("SalaryExplorerPage benchmark notice", () => {
  it("shows the pay label and the mix sentence for a pooled crowd result", async () => {
    await search({
      p25: 1, p50: 2, p75: 3, p90: 4, count: 15, dataSource: "crowdsourced", payBasis: "mixed",
      payMix: { offered: 12, current: 3, unlabelled: 0 },
      disclaimer: "Based on 15 crowdsourced, unverified data points for this role and city, pooled because no single kind of pay had 10 yet. 12 of 15 data points are offered pay, 3 are current pay.",
    });
    expect(await screen.findByText(/12 of 15 data points are offered pay/)).toBeTruthy();
    expect(screen.getByText(/\(n = 15\), offered and current pay mixed/)).toBeTruthy();
  });

  it("shows the backend's survey disclaimer, not a hard-coded one", async () => {
    await search({
      p25: 1, p50: 2, p75: 3, p90: 4, count: 39, dataSource: "public_survey",
      disclaimer: "Modelled from public surveys, not offers in your city. Survey figures describe current pay.",
    });
    expect(await screen.findByText(/Survey figures describe current pay/)).toBeTruthy();
  });

  it("opens the contribute dialog with the pay-basis question", async () => {
    await search({ p25: 1, p50: 2, p75: 3, p90: 4, count: 39, dataSource: "public_survey", disclaimer: "x" });
    await screen.findByText(/Survey figures|x/);
    fireEvent.click(screen.getByRole("button", { name: "Submit Your Salary" }));
    expect(await screen.findByRole("radiogroup", { name: "What kind of pay is this?" })).toBeTruthy();
  });
});

describe("SalaryExplorerPage SAL-1 request gating", () => {
  const renderPage = () => {
    get.mockClear(); // module-level spy accrues calls across tests; count assertions below need a clean slate
    return render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SalaryExplorerPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  it("does not fire a new request on keystrokes after an initial search — only on an explicit Search", async () => {
    get.mockResolvedValue({ data: { data: { p25: 1, p50: 2, p75: 3, p90: 4, count: 15, dataSource: "crowdsourced", disclaimer: "x" } } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByPlaceholderText(/City/), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));

    await screen.findByTestId("salary-bar");
    expect(get).toHaveBeenCalledTimes(1);

    // Typing after the search changes only the draft input — no request must fire.
    fireEvent.change(screen.getByPlaceholderText(/Role/), { target: { value: "Backend Engineers" } });
    fireEvent.change(screen.getByPlaceholderText(/City/), { target: { value: "Pune City" } });
    expect(get).toHaveBeenCalledTimes(1);

    // Only an explicit Search commits the new terms and fires exactly one more request.
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("does not fire a request or show the empty-state for a too-short (1-char) term", async () => {
    get.mockResolvedValue({ data: { data: null } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Role/), { target: { value: "A" } });
    fireEvent.change(screen.getByPlaceholderText(/City/), { target: { value: "B" } });

    // Below the backend 2-char minimum: the Search button is disabled.
    expect((screen.getByRole("button", { name: /Search/ }) as HTMLButtonElement).disabled).toBe(true);

    // Clicking anyway must not fire and must not show the misleading empty-state.
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText(/No data for this combination yet/)).toBeNull();
  });

  it("shows the empty-state only when a valid submitted search returns empty", async () => {
    get.mockResolvedValue({ data: { data: null } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByPlaceholderText(/City/), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));

    expect(await screen.findByText(/No data for this combination yet/)).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
