import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RATE_LIMITED_TEXT } from "@/lib/quota";

// NEG-2/3/4/7/10: the panel adopts the typed NegotiationScript union, persists the script in
// the query cache across drawer close/reopen, clears it on a new/failed generation, copies both
// subject + body, and handles a rate-limit 429 distinctly from the generic error.
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/services/api", () => ({ default: { post: vi.fn() } }));

const { default: api } = await import("@/services/api");
const { default: NegotiationPanel } = await import("./NegotiationPanel");

const OFFER_ID = "o1";

const PERSONALIZED = {
  data: {
    data: {
      type: "personalized",
      subject: "Revisiting my Acme offer",
      body: "Dear Hiring Manager, I'd like to discuss the compensation.",
      suggestions: [],
    },
  },
};

const TEMPLATE = {
  data: {
    data: {
      type: "template",
      subject: "Discussing my offer",
      body: "Dear [NAME], I'd like to revisit the [SALARY].",
      note: "We could not extract enough detail for a fully personalised script.",
      suggestions: [],
    },
  },
};

const rateLimit = { response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED" } } } };
const quotaExhausted = {
  response: {
    status: 429,
    data: {
      error: {
        code: "QUOTA_EXCEEDED",
        details: { feature: "negotiation", limit: 5, used: 5, remaining: 0, resetAt: "2025-01-01T00:00:00Z", plan: "free" },
      },
    },
  },
};

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderPanel = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <NegotiationPanel offerId={OFFER_ID} />
    </QueryClientProvider>,
  );

const stubClipboard = (writeText: ReturnType<typeof vi.fn>) =>
  Object.assign(navigator, { clipboard: { writeText } });

const generate = () => fireEvent.click(screen.getByRole("button", { name: /Generate Script/i }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NegotiationPanel typed render (NEG-10)", () => {
  it("renders a personalized script's subject and body with one POST and no JSON blob", async () => {
    vi.mocked(api.post).mockResolvedValue(PERSONALIZED);
    renderPanel(newClient());
    generate();

    await waitFor(() => expect(screen.getByText(/Subject: Revisiting my Acme offer/)).toBeTruthy());
    expect(screen.getByText(/discuss the compensation/)).toBeTruthy();
    expect(screen.queryByText(/"type":/)).toBeNull();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
    expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1);
  });

  it("renders a template script's note alongside its subject and body (NEG-3 thin-data path)", async () => {
    vi.mocked(api.post).mockResolvedValue(TEMPLATE);
    renderPanel(newClient());
    generate();

    await waitFor(() => expect(screen.getByText(/could not extract enough detail/)).toBeTruthy());
    expect(screen.getByText(/Subject: Discussing my offer/)).toBeTruthy();
    expect(screen.getByText(/revisit the \[SALARY\]/)).toBeTruthy();
    expect(screen.queryByText(/"type":/)).toBeNull();
  });
});

describe("NegotiationPanel copy (NEG-4)", () => {
  it("copies both subject and body, and shows Copied! only on a resolved write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    vi.mocked(api.post).mockResolvedValue(PERSONALIZED);
    renderPanel(newClient());
    generate();

    const copy = await screen.findByRole("button", { name: /Copy/i });
    fireEvent.click(copy);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.startsWith("Subject: Revisiting my Acme offer")).toBe(true);
    expect(copied).toContain("discuss the compensation");
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Copied!" }));
  });

  it("does NOT show Copied! when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    vi.mocked(api.post).mockResolvedValue(PERSONALIZED);
    renderPanel(newClient());
    generate();

    const copy = await screen.findByRole("button", { name: /Copy/i });
    fireEvent.click(copy);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't copy" })),
    );
    expect(toast).not.toHaveBeenCalledWith({ title: "Copied!" });
  });

  it("a rate-limit 429 shows the rate-limit message, not the generic error", async () => {
    vi.mocked(api.post).mockRejectedValue(rateLimit);
    renderPanel(newClient());
    generate();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(RATE_LIMITED_TEXT));
  });

  it("a daily-quota 429 shows the quota-exhausted copy", async () => {
    vi.mocked(api.post).mockRejectedValue(quotaExhausted);
    renderPanel(newClient());
    generate();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/today's limit of 5 negotiation scripts/i));
  });
});

describe("NegotiationPanel stale clear on error (NEG-7)", () => {
  it("a subsequent failed generation does not keep the previous script on screen", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    vi.mocked(api.post).mockResolvedValueOnce(PERSONALIZED).mockRejectedValueOnce(rateLimit);
    renderPanel(newClient());

    generate();
    await waitFor(() => expect(screen.getByText(/Subject: Revisiting my Acme offer/)).toBeTruthy());

    generate();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // The old subject/body must be gone — not sitting under the error, not copyable.
    expect(screen.queryByText(/Subject: Revisiting my Acme offer/)).toBeNull();
    expect(screen.queryByText(/discuss the compensation/)).toBeNull();
  });
});

describe("NegotiationPanel persistence across close/reopen (NEG-2)", () => {
  it("shows the same script on reopen WITHOUT a second generation request", async () => {
    vi.mocked(api.post).mockResolvedValue(PERSONALIZED);
    const client = newClient();

    const first = renderPanel(client);
    generate();
    await waitFor(() => expect(screen.getByText(/Subject: Revisiting my Acme offer/)).toBeTruthy());
    expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1);

    // Closing the drawer unmounts the panel; reopening remounts a fresh instance sharing the
    // same QueryClient.
    first.unmount();
    renderPanel(client);

    // The script is back from the cache, and no new POST fired.
    await waitFor(() => expect(screen.getByText(/Subject: Revisiting my Acme offer/)).toBeTruthy());
    expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1);
  });
});
