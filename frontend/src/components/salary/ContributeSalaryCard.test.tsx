import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContributionAnalysis } from "@/lib/salary-contribution";
import { RATE_LIMITED_TEXT } from "@/lib/quota";

vi.mock("@/services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
const { default: api } = await import("@/services/api");
const { default: ContributeSalaryCard } = await import("./ContributeSalaryCard");

const OFFER_ID = "11111111-2222-3333-4444-555555555555";
const COMPANY = "Acme Payments Private Limited";
const analysis = (): ContributionAnalysis => ({
  offerStatus: "COMPLETED",
  lowConfidence: false,
  confidence: { caveat: null, fields: { totalCTC: { level: "high" } } },
  extractedData: {
    role: "Backend Engineer", location: "Pune", companyName: COMPANY, companyType: "product",
    employmentType: "full-time", compensation: { totalCTC: 2_400_000, currency: "INR" },
  },
});

const post = api.post as ReturnType<typeof vi.fn>;
const renderCard = (a = analysis(), id = OFFER_ID) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ContributeSalaryCard key={id} offerId={id} analysis={a} />
    </QueryClientProvider>,
  );
const region = () => screen.getByRole("status");
const open = () => fireEvent.click(screen.getByRole("button", { name: "Review and share" }));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const send = () => fireEvent.click(screen.getByRole("button", { name: /Send data point/ }));
const cooldownError = {
  response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED", details: { reason: "ALREADY_SUBMITTED" } } } },
};

beforeEach(() => { localStorage.clear(); post.mockReset(); post.mockResolvedValue({ data: {} }); });
afterEach(cleanup);

describe("ContributeSalaryCard", () => {
  it("posts nothing on render, on expand, or on No thanks; No thanks hides it for that offer only", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Help others see real offers" })).toBeTruthy();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(post).not.toHaveBeenCalled();
    expect(localStorage.getItem(`salary_contrib:v1:${OFFER_ID}`)).toBe("dismissed");
    expect(document.activeElement).toBe(screen.getByText(/will not ask again/));
    cleanup();
    expect(renderCard().container.querySelector("section")).toBeNull(); // same offer: gone
    cleanup();
    expect(renderCard(analysis(), "another-offer").container.querySelector("section")).not.toBeNull();
  });

  it("is absent when the gate is false", () => {
    const a = analysis(); a.lowConfidence = true;
    expect(renderCard(a).container.querySelector("section")).toBeNull();
  });

  it("opens with every field prefilled, years blank, and focus on the first empty field", () => {
    renderCard();
    open();
    expect((screen.getByLabelText("Job title") as HTMLInputElement).value).toBe("Backend Engineer");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Pune");
    expect((screen.getByLabelText("Years of experience") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Yearly CTC/) as HTMLInputElement).value).toBe("2400000");
    expect(document.activeElement).toBe(screen.getByLabelText("Years of experience"));
    expect(screen.queryByRole("radio")).toBeNull(); // the card asks nothing new: it contributes the offer in the letter
  });

  it("keeps Send enabled when empty, invalid and pending; invalid submit posts nothing, announces and focuses the field", () => {
    renderCard();
    open();
    const sendBtn = screen.getByRole("button", { name: /Send data point/ });
    expect(sendBtn).not.toHaveAttribute("disabled");
    const regionNode = region();
    send();
    expect(post).not.toHaveBeenCalled();
    expect(region().textContent).toBe("1 field needs attention");
    expect(region()).toBe(regionNode); // same node: it never remounted
    expect(document.activeElement).toBe(screen.getByLabelText("Years of experience"));
    expect(screen.getByLabelText("Years of experience")).toHaveAttribute("aria-invalid", "true");
    expect(sendBtn).not.toHaveAttribute("disabled");
  });

  it("posts only the allowlisted keys, never the offer id or company name, then focuses the acknowledgement", async () => {
    renderCard();
    open();
    type("Years of experience", "4");
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0][1];
    expect(Object.keys(body).sort()).toEqual(["city", "companyType", "ctc", "experienceYears", "payBasis", "role"]);
    expect(body).toMatchObject({ role: "Backend Engineer", city: "Pune", experienceYears: 4, ctc: 2_400_000, companyType: "product", payBasis: "offered" });
    expect(JSON.stringify(body)).not.toContain(OFFER_ID);
    expect(JSON.stringify(body)).not.toMatch(/acme/i);
    const ack = await screen.findByText(/at least 10 data points/);
    expect(document.activeElement).toBe(ack);
    expect(region().textContent).toBe(""); // not announced twice
    expect(localStorage.getItem(`salary_contrib:v1:${OFFER_ID}`)).toBe("contributed");
  });

  it("blocks a role carrying the company's brand word and focuses it; a later word needs the confirm checkbox", async () => {
    renderCard();
    open();
    type("Years of experience", "4");
    type("Job title", "Acme Engineer");
    send();
    expect(post).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("Job title"));
    expect(screen.getByText("Remove the company name")).toBeTruthy();

    type("Job title", "Payments Engineer");
    send();
    expect(post).not.toHaveBeenCalled();
    const box = screen.getByLabelText("This is a general job title, not the company name");
    expect(document.activeElement).toBe(box);
    fireEvent.click(box);
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("on the cooldown 429 shows the cooldown text (not the limiter's), keeps values and focus, writes no marker", async () => {
    post.mockRejectedValue(cooldownError);
    renderCard();
    open();
    type("Years of experience", "4");
    const sendBtn = screen.getByRole("button", { name: /Send data point/ });
    sendBtn.focus();
    fireEvent.click(sendBtn);
    await waitFor(() => expect(region().textContent).toMatch(/already shared a data point/));
    expect(region().textContent).not.toBe(RATE_LIMITED_TEXT);
    expect(document.activeElement).toBe(sendBtn);
    expect((screen.getByLabelText("Years of experience") as HTMLInputElement).value).toBe("4");
    expect(localStorage.getItem(`salary_contrib:v1:${OFFER_ID}`)).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows the limiter's own text for a plain RATE_LIMIT_EXCEEDED", async () => {
    post.mockRejectedValue({ response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED" } } } });
    renderCard();
    open();
    type("Years of experience", "4");
    send();
    expect((await screen.findByRole("alert")).textContent).toBe(RATE_LIMITED_TEXT);
  });

  it("ignores a second click while pending (one POST) and marks the button aria-disabled, not disabled", async () => {
    let resolve!: () => void;
    post.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    renderCard();
    open();
    type("Years of experience", "4");
    const sendBtn = screen.getByRole("button", { name: /Send data point/ });
    fireEvent.click(sendBtn);
    await waitFor(() => expect(sendBtn).toHaveAttribute("aria-disabled", "true"));
    expect(sendBtn).toHaveAttribute("aria-busy", "true");
    expect(sendBtn).not.toHaveAttribute("disabled");
    fireEvent.click(sendBtn);
    expect(post).toHaveBeenCalledTimes(1);
    resolve();
    await screen.findByText(/at least 10 data points/);
  });

  it("Cancel returns focus to Review and share", () => {
    renderCard();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review and share" }));
  });

  it("avoids the overclaiming privacy wording the design bans (section 3.3)", () => {
    const { container } = renderCard();
    open();
    // Built from parts so a repo-wide grep for the banned word stays clean (AC 1).
    expect(container.textContent).not.toMatch(new RegExp(["anon", "ym"].join(""), "i"));
  });
});
