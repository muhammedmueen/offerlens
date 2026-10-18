import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FeatureRequest } from "@/types/api";

// Shapes follow the backend (feature-request.service.ts): `voteCount`, `hasVoted`, and the status
// enum `in_progress`. The page used to read `votes` and send `status=in progress`, so every count
// was 0 and that filter returned a 400.

const row = (over: Partial<FeatureRequest>): FeatureRequest => ({
  id: "r1", title: "Dark mode support", description: "Add a dark mode toggle for late-night review.",
  status: "open", voteCount: 42, hasVoted: false, createdAt: "2026-10-01T00:00:00Z", ...over,
});
let rows: FeatureRequest[];
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(async () => ({ data: { data: rows } })), post: vi.fn(async () => ({ data: { data: {} } })) },
}));
// framer-motion's in-view observer needs IntersectionObserver, which jsdom lacks.
vi.mock("@/components/common/MotionCard", () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const { default: FeatureRequestsPage } = await import("./FeatureRequestsPage");
const { default: api } = await import("@/services/api");

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FeatureRequestsPage /></QueryClientProvider>);
};

beforeEach(() => { vi.clearAllMocks(); rows = [row({})]; });
afterEach(cleanup);

describe("Feature requests list", () => {
  it("shows the real vote count and a readable status", async () => {
    rows = [row({ status: "in_progress" })];
    renderPage();
    expect(await screen.findByText("42")).toBeTruthy();
    expect(screen.getByText("in progress")).toBeTruthy();
  });

  it("the In progress filter sends the API's enum value, in_progress", async () => {
    renderPage();
    await screen.findByText("42");
    fireEvent.click(screen.getByRole("button", { name: "In progress" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/feature-requests", { params: { sort: "votes", status: "in_progress", page: 1 } }),
    );
  });

  it("marks a request the caller already voted on, and disables its vote button", async () => {
    rows = [row({ hasVoted: true })];
    renderPage();
    const btn = await screen.findByRole("button", { name: /Voted for Dark mode support/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("posts a vote for an unvoted request", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Vote for Dark mode support/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/feature-requests/r1/vote"));
  });
});

describe("Errors", () => {
  it("tells the user when the server says they already voted, instead of a generic failure", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 409, data: { error: { code: "ALREADY_VOTED" } } } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Vote for Dark mode support/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Already voted" })));
  });

  it("shows a destructive toast when a vote fails for any other reason", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Vote for Dark mode support/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not record vote", variant: "destructive" })));
  });

  it("shows a toast when submitting fails, rather than doing nothing", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 400, data: { error: { code: "VALIDATION_ERROR" } } } });
    renderPage();
    await screen.findByText("42");
    fireEvent.click(screen.getByRole("button", { name: /Submit Request/ }));
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Dark mode" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Add a dark mode toggle please." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not submit request", variant: "destructive" })));
  });
});

describe("Submit form", () => {
  const open = async () => {
    renderPage();
    await screen.findByText("42");
    fireEvent.click(screen.getByRole("button", { name: /Submit Request/ }));
    return {
      title: await screen.findByLabelText("Title"),
      description: screen.getByLabelText("Description"),
      submit: () => screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement,
    };
  };

  it("keeps Submit disabled until the title has 5+ and the description 20+ characters", async () => {
    const f = await open();
    expect(f.submit().disabled).toBe(true);

    fireEvent.change(f.title, { target: { value: "Dark" } });
    fireEvent.change(f.description, { target: { value: "x".repeat(25) } });
    expect(f.submit().disabled).toBe(true);

    fireEvent.change(f.title, { target: { value: "Dark mode" } });
    fireEvent.change(f.description, { target: { value: "short" } });
    expect(f.submit().disabled).toBe(true);

    fireEvent.change(f.description, { target: { value: "x".repeat(20) } });
    expect(f.submit().disabled).toBe(false);
  });

  it("does not count surrounding whitespace toward the minimum", async () => {
    const f = await open();
    fireEvent.change(f.title, { target: { value: "  ab  " } });
    fireEvent.change(f.description, { target: { value: " ".repeat(10) + "x".repeat(10) + " ".repeat(10) } });
    expect(f.submit().disabled).toBe(true);
  });

  it("posts the request when valid", async () => {
    const f = await open();
    fireEvent.change(f.title, { target: { value: "Dark mode" } });
    fireEvent.change(f.description, { target: { value: "Add a dark mode toggle please." } });
    fireEvent.click(f.submit());
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/feature-requests", { title: "Dark mode", description: "Add a dark mode toggle please." }),
    );
  });
});
