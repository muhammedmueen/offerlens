import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// COR-1: the panel must read back the applied correction on reopen and never claim success
// without a real change. `api` is mocked; the analysis GET returns a corrected totalCTC after
// the PATCH so the re-seed path is exercised.

const OFFER_ID = "11111111-1111-1111-1111-111111111111";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const analysis = {
  extractedData: {
    companyName: "Acme", role: "Backend Engineer", location: "Pune",
    compensation: { totalCTC: 1200000 }, noticePeriod: "30 days", probationPeriod: "3 months",
  },
};

const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock("@/services/api", () => ({
  default: { get: (...a: unknown[]) => apiGet(...a), patch: (...a: unknown[]) => apiPatch(...a) },
}));
vi.mock("@/components/common/LoadingState", () => ({ default: () => <div>loading</div> }));

const { default: CorrectionsPanel } = await import("./CorrectionsPanel");

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CorrectionsPanel offerId={OFFER_ID} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation((url: string) =>
    url.endsWith("/analysis")
      ? Promise.resolve({ data: { data: analysis } })
      : Promise.resolve({ data: { data: [] } }),
  );
  apiPatch.mockResolvedValue({ data: { data: { changed: true, correctionsApplied: 1, totalSubmitted: 1 } } });
});
afterEach(cleanup);

describe("CorrectionsPanel", () => {
  it("invalidates the analysis query and re-seeds the corrected value on a successful save", async () => {
    renderPanel();
    const ctc = (await screen.findByLabelText("Total CTC")) as HTMLInputElement;
    expect(ctc.value).toBe("1200000");

    // After the save, the server has applied the fix, so the re-read returns the corrected CTC.
    const corrected = { ...analysis, extractedData: { ...analysis.extractedData, compensation: { totalCTC: 3000000 } } };
    apiGet.mockImplementation((url: string) =>
      url.endsWith("/analysis")
        ? Promise.resolve({ data: { data: corrected } })
        : Promise.resolve({ data: { data: [] } }),
    );

    fireEvent.change(ctc, { target: { value: "3000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 correction/ }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith(
      `/offers/${OFFER_ID}/corrections`,
      { corrections: [{ field: "extractedData.compensation.totalCTC", correctedValue: 3000000 }] },
    ));

    // The query is invalidated, so the analysis GET is re-issued and the input re-seeds to the
    // corrected value — reopening shows the corrected value, not the original.
    await waitFor(() => {
      const after = screen.getByLabelText("Total CTC") as HTMLInputElement;
      expect(after.value).toBe("3000000");
    });
  });

  it("the success toast says applied on a real change", async () => {
    renderPanel();
    const ctc = await screen.findByLabelText("Total CTC");
    fireEvent.change(ctc, { target: { value: "3000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 correction/ }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].title).toBe("Corrections applied");
    expect(toast.mock.calls[0][0].description).toMatch(/applied to this analysis/);
  });

  it("does not claim success when nothing changed", async () => {
    apiPatch.mockResolvedValue({ data: { data: { changed: false, correctionsApplied: 0, totalSubmitted: 1 } } });
    renderPanel();
    const ctc = await screen.findByLabelText("Total CTC");
    // Change then change back so the button enables but the server reports no change.
    fireEvent.change(ctc, { target: { value: "3000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 correction/ }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].title).toBe("No changes to save");
    // The analysis query is NOT invalidated when nothing changed (only the initial mount GET).
    const analysisGets = apiGet.mock.calls.filter((c) => String(c[0]).endsWith("/analysis"));
    expect(analysisGets.length).toBe(1);
  });
});
