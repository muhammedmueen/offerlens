import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
const { default: api } = await import("@/services/api");
const { default: SalaryContributeForm } = await import("./SalaryContributeForm");

const post = api.post as ReturnType<typeof vi.fn>;
// Everything but the pay basis is prefilled (the Radix company-type select cannot be opened in jsdom).
const FILLED = { role: "Backend Engineer", city: "Pune", years: "4", ctc: "2400000", companyType: "product" };
const renderForm = (initial: object = FILLED) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <SalaryContributeForm idPrefix="explorer" showPayBasis initial={initial} cancelLabel="Cancel" announce={() => {}} onSent={() => {}} onCancel={() => {}} />
    </QueryClientProvider>,
  );
const send = () => fireEvent.click(screen.getByRole("button", { name: /Send data point/ }));

beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: {} }); });
afterEach(cleanup);

describe("SalaryContributeForm pay basis (Explorer mode)", () => {
  it("offers three labelled radios in a fieldset with a legend, nothing preselected", () => {
    renderForm();
    const group = screen.getByRole("radiogroup", { name: "What kind of pay is this?" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(["Current pay", "Offered pay", "Not sure"]);
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(group.getAttribute("aria-invalid")).toBe("false"); // no error yet
    expect(screen.getByLabelText("Yearly CTC (₹)")).toBeTruthy();
    expect(screen.getByText(/whether this is current or offered pay/)).toBeTruthy();
  });

  it("submitting with none chosen shows the error, focuses the first radio, describes the group by it and posts nothing", () => {
    renderForm();
    send();
    expect(post).not.toHaveBeenCalled();
    const msg = screen.getByText("Choose current pay, offered pay or not sure");
    const group = screen.getByRole("radiogroup", { name: "What kind of pay is this?" });
    expect(group.getAttribute("aria-describedby")).toBe(msg.id);
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Current pay"));
  });

  it("choosing a radio clears the error", () => {
    renderForm();
    send();
    fireEvent.click(screen.getByLabelText("Not sure"));
    expect(screen.queryByText("Choose current pay, offered pay or not sure")).toBeNull();
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("false");
    expect((screen.getByLabelText("Not sure") as HTMLInputElement).checked).toBe(true);
  });

  it("Current pay posts payBasis 'current'", async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("Current pay"));
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ payBasis: "current", ctc: 2_400_000 });
  });

  it("Not sure posts a body with no payBasis key", async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("Not sure"));
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(Object.keys(post.mock.calls[0][1])).not.toContain("payBasis");
  });
});
