import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RATE_LIMITED_TEXT } from "@/lib/quota";

// BEN-3: a failed benefits request must NOT be reported as an empty offer, and a failed
// recalculate must surface feedback.
vi.mock("@/services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/components/charts/BenefitsPie", () => ({ default: () => <div data-testid="pie" /> }));

const { default: api } = await import("@/services/api");
const { default: BenefitsPanel } = await import("./BenefitsPanel");

const NO_DATA = /No benefits data found|total comp equals your base CTC/i;

const rateLimit = { response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED" } } } };
const quotaExhausted = {
  response: {
    status: 429,
    data: {
      error: {
        code: "QUOTA_EXCEEDED",
        details: { feature: "analysis", limit: 3, used: 3, remaining: 0, resetAt: "2025-01-01T00:00:00Z", plan: "free" },
      },
    },
  },
};
const serverError = { response: { status: 500, data: { error: { code: "INTERNAL" } } } };

const renderPanel = () =>
  render(
    // The panel sets its own `retry` predicate on the benefits query, so the client's
    // `retry: false` is ignored for it — pin `retryDelay: 0` so the 3 retries resolve
    // instantly instead of running out the exponential backoff past waitFor's timeout.
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } })}
    >
      <BenefitsPanel offerId="o1" />
    </QueryClientProvider>,
  );

const WITH_BENEFITS = {
  data: {
    data: {
      currency: "INR",
      benefitsValue: 100000,
      totalCompensation: 1100000,
      breakdown: [{ name: "Health insurance", category: "health", monetaryValue: 100000, details: "", isQuantifiable: true }],
    },
  },
};

afterEach(() => {
  cleanup();
  vi.mocked(api.post).mockReset();
});

describe("BenefitsPanel query failure (BEN-3)", () => {
  it("a 500 / network error shows the error+retry state, not the no-data copy", async () => {
    vi.mocked(api.post).mockRejectedValue(serverError);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Try again/i })).toBeTruthy();
    expect(screen.queryByText(NO_DATA)).toBeNull();
  });

  it("a rate-limit 429 shows the rate-limit text, not the no-data copy", async () => {
    vi.mocked(api.post).mockRejectedValue(rateLimit);
    renderPanel();

    await waitFor(() => expect(screen.getByText(RATE_LIMITED_TEXT)).toBeTruthy());
    expect(screen.queryByText(NO_DATA)).toBeNull();
  });

  it("an exhausted-quota 429 shows the quota text with no retry button", async () => {
    vi.mocked(api.post).mockRejectedValue(quotaExhausted);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/used all 3 analyses today/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
    expect(screen.queryByText(NO_DATA)).toBeNull();
  });
});

describe("BenefitsPanel genuinely-empty offer (BEN-3 preserves the legitimate case)", () => {
  it("a SUCCESSFUL empty breakdown still shows the no-data message", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { currency: "INR", breakdown: [] } } });
    renderPanel();

    await waitFor(() => expect(screen.getByText(NO_DATA)).toBeTruthy());
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });
});

describe("BenefitsPanel recalculate success (BEN-4)", () => {
  // Backend returns the full recalculated result (totals + breakdown) computed with overrides.
  const RECALCULATED = {
    data: {
      data: {
        currency: "INR",
        benefitsValue: 250000,
        totalCompensation: 1250000,
        breakdown: [{ name: "Health insurance", category: "health", monetaryValue: 250000, details: "", isQuantifiable: true }],
      },
    },
  };

  it("headline totals show the recalculated value and do not revert to the original", async () => {
    // Initial query -> original totals; recalculate POST -> higher totals. A stray refetch
    // of the no-override query (the BEN-4 bug) would re-resolve to the original, so we make
    // every call AFTER the recalculate return the ORIGINAL again: if any refetch clobbers
    // the view, the original total reappears and the assertion fails.
    vi.mocked(api.post).mockResolvedValueOnce(WITH_BENEFITS).mockResolvedValueOnce(RECALCULATED).mockResolvedValue(WITH_BENEFITS);
    renderPanel();

    // Original total is on screen first.
    await waitFor(() => expect(screen.getByText("₹11,00,000")).toBeTruthy());

    const input = screen.getByLabelText(/Value for Health insurance/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: /Recalculate with my values/i }));

    // Recalculated total appears...
    await waitFor(() => expect(screen.getByText("₹12,50,000")).toBeTruthy());
    // ...and the original is gone (did not snap back).
    expect(screen.queryByText("₹11,00,000")).toBeNull();

    // Stays put even after any settled refetch: the override value remains in the input and
    // the recalculated total holds (no split-brain between inputs/pie and headline).
    await waitFor(() => expect(screen.getByText("₹2,50,000")).toBeTruthy()); // benefits value too
    expect(screen.getByText("₹12,50,000")).toBeTruthy();
    expect(input.value).toBe("250000");
    expect(screen.queryByText("₹11,00,000")).toBeNull();
  });
});

describe("BenefitsPanel Model A note + insurance cover display (BEN-2)", () => {
  const WITH_INSURANCE_COVER = {
    data: {
      data: {
        currency: "INR",
        benefitsValue: 0,
        totalCompensation: 1200000,
        breakdown: [
          {
            name: "Health insurance",
            category: "insurance",
            monetaryValue: null,
            details: "Cover: ₹5,00,000",
            isQuantifiable: false,
          },
        ],
      },
    },
  };

  it("renders the Model A note near the headline", async () => {
    vi.mocked(api.post).mockResolvedValue(WITH_INSURANCE_COVER);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(/part of your CTC.*changes the breakdown/i)).toBeTruthy(),
    );
  });

  it("shows the insurance cover detail but no rupee monetary value for the row", async () => {
    vi.mocked(api.post).mockResolvedValue(WITH_INSURANCE_COVER);
    renderPanel();

    // Coverage detail is shown...
    await waitFor(() => expect(screen.getByText("Cover: ₹5,00,000")).toBeTruthy());
    // ...and the row's value input is empty (monetaryValue is null, not a rupee amount).
    const input = screen.getByLabelText(/Value for Health insurance/i) as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("BenefitsPanel recalculate failure (BEN-3)", () => {
  it("a failed recalculate surfaces an alert", async () => {
    // First call (initial query) succeeds; the recalculate POST then fails.
    vi.mocked(api.post).mockResolvedValueOnce(WITH_BENEFITS).mockRejectedValueOnce(serverError);
    renderPanel();

    const button = await screen.findByRole("button", { name: /Recalculate with my values/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't recalculate/i);
  });
});
