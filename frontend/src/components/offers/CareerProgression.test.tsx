import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CareerProgression, { type Progression } from "./CareerProgression";
import CareerPathPanel from "./CareerPathPanel";
import { ODBL_URL, PLFS_CITATION_TEXT, PLFS_URL, SO_SURVEY_URL } from "@/constants/attribution";

vi.mock("@/services/api", () => ({ default: { get: vi.fn() } }));
import api from "@/services/api";

afterEach(cleanup);

const cell = (bracket: string, p: [number, number, number] | null, extra = {}) => ({
  bracket,
  sampleSize: p ? 39 : 6,
  crowdN: 0,
  source: p ? ("public_survey" as const) : null,
  marketRange: p ? { p25: p[0], p50: p[1], p75: p[2] } : null,
  step: null,
  ...extra,
});

const SURVEY_NOTE = {
  source: "public_survey" as const,
  disclaimer: "Modelled from public surveys, not offers in your city. India-wide figures from the survey.",
};

const base: Progression = {
  applicable: true,
  roleUsed: "Backend Engineer",
  cityUsed: "Bangalore",
  currentBracket: "Mid-Level (3-5 yrs)",
  cells: [
    cell("Fresher (0-1 yrs)", null, { sampleSize: 0 }),
    cell("Junior (1-3 yrs)", [1_500_000, 2_000_000, 2_600_000]),
    cell("Mid-Level (3-5 yrs)", [2_000_000, 2_340_000, 3_000_000], { step: { absolute: 340_000, percent: 17 } }),
    cell("Senior (5-8 yrs)", [1_900_000, 2_250_000, 2_900_000], { step: { absolute: -90_000, percent: -4 } }),
    cell("Staff/Lead (8-12 yrs)", null, { sampleSize: 6, crowdN: 8 }),
  ],
  notes: [SURVEY_NOTE],
};

describe("CareerProgression", () => {
  it("renders nothing for an older response without progression", () => {
    const { container } = render(<CareerProgression progression={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("is an accessible table: caption with no geography, column and row headers, your-level text", () => {
    render(<CareerProgression progression={base} />);
    const table = screen.getByRole("table", { name: /Typical annual pay for Backend Engineer, by years of experience/ });
    expect(table.querySelector("caption")?.textContent).not.toMatch(/India|Bangalore/);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Experience", "Median", "Middle half (25th-75th)", "Change from previous", "Based on",
    ]);
    expect(within(table).getAllByRole("rowheader")).toHaveLength(5);
    expect(screen.getByRole("rowheader", { name: "Mid-Level (3-5 yrs) (your level)" })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Pay by years of experience table/ }).getAttribute("tabindex")).toBe("0");
  });

  it("shows Indian-grouped figures and signed steps with a real minus sign", () => {
    render(<CareerProgression progression={base} />);
    expect(screen.getByText("₹23,40,000")).toBeTruthy();
    expect(screen.getByText("₹15,00,000 to ₹26,00,000")).toBeTruthy();
    expect(screen.getByText("+₹3,40,000 (+17%)")).toBeTruthy();
    expect(screen.getByText("−₹90,000 (−4%)")).toBeTruthy();
  });

  it.each([
    [{ absolute: 340_000, percent: 17 }, "+₹3,40,000 (+17%)"],
    [{ absolute: -90_000, percent: -4 }, "−₹90,000 (−4%)"],
    [{ absolute: -1_000, percent: 0 }, "−₹1,000 (0%)"], // rounds to 0%: no sign that contradicts the amount
    [{ absolute: 1_000, percent: 0 }, "+₹1,000 (0%)"],
    [{ absolute: 0, percent: 0 }, "No change"],
  ])("step %j renders as %s", (step, text) => {
    render(<CareerProgression progression={{ ...base, cells: [cell("Mid-Level (3-5 yrs)", [1, 2, 3], { step })] }} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("a thin cell shows its n and no number; crowd count only when non-zero", () => {
    const { container } = render(<CareerProgression progression={base} />);
    expect(screen.getByText("Not enough data (0 survey respondents; at least 10 needed)")).toBeTruthy();
    expect(screen.getByText("Not enough data (6 survey respondents, 8 crowdsourced; at least 10 needed)")).toBeTruthy();
    const thin = container.querySelectorAll("td[colspan='4']");
    expect(thin).toHaveLength(2);
    thin.forEach((td) => expect(td.textContent).not.toMatch(/₹/));
  });

  it("singular wording for one respondent", () => {
    render(<CareerProgression progression={{ ...base, cells: [cell("Fresher (0-1 yrs)", null, { sampleSize: 1 })] }} />);
    expect(screen.getByText("Not enough data (1 survey respondent; at least 10 needed)")).toBeTruthy();
  });

  it("states the scope per row: India-wide for survey, the city for crowd", () => {
    const crowdCell = cell("Senior (5-8 yrs)", [3_000_000, 3_500_000, 4_000_000], { source: "crowdsourced", sampleSize: 12, crowdN: 12 });
    render(<CareerProgression progression={{
      ...base,
      cells: [cell("Mid-Level (3-5 yrs)", [2_000_000, 2_340_000, 3_000_000]), crowdCell],
      notes: [SURVEY_NOTE, { source: "crowdsourced", disclaimer: 'Rows marked "crowdsourced" are unverified submissions for this role and city.' }],
    }} />);
    expect(screen.getByText("39 survey respondents, India-wide")).toBeTruthy();
    expect(screen.getByText("12 crowdsourced submissions, Bangalore")).toBeTruthy();
    // Crowd note is its own foreground-coloured paragraph, not BenchmarkNotice's muted one.
    const note = screen.getByText(/unverified submissions/);
    expect(note.className).toContain("text-foreground");
    expect(note.className).not.toContain("text-muted-foreground");
  });

  it("carries the survey attribution as real anchors and the disclaimer", () => {
    const { container } = render(<CareerProgression progression={base} />);
    expect(screen.getByText(/Modelled from public surveys, not offers in your city/)).toBeTruthy();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(SO_SURVEY_URL);
    expect(hrefs).toContain(ODBL_URL);
  });

  it("5.1b: scaled survey cells say so, crowd cells do not, and the PLFS citation is a real link", () => {
    const crowdCell = cell("Senior (5-8 yrs)", [3_000_000, 3_500_000, 4_000_000], { source: "crowdsourced", sampleSize: 12, crowdN: 12 });
    const { container } = render(<CareerProgression progression={{
      ...base,
      cells: [cell("Mid-Level (3-5 yrs)", [2_000_000, 2_340_000, 3_000_000]), crowdCell],
      cityAdjustment: { cityLabel: "Bangalore", factor: 1.04, plfsSampleSize: 112 },
    }} />);
    expect(screen.getByText("39 survey respondents, India-wide, scaled to Bangalore")).toBeTruthy();
    expect(screen.getByText("12 crowdsourced submissions, Bangalore")).toBeTruthy();
    expect(container.textContent).toContain(PLFS_CITATION_TEXT);
    expect(Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toContain(PLFS_URL);
  });

  it("with no numeric row says so and still renders the table with its ns", () => {
    render(<CareerProgression progression={{ ...base, cells: [cell("Fresher (0-1 yrs)", null, { sampleSize: 0 })] }} />);
    expect(screen.getByText(/There isn.t enough survey data to show pay growth/)).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it.each(["role_not_covered", "non_inr", "city_not_covered", "lookup_error"])(
    "fallback for %s shows no table, no number, and avoids the smoke spec's error wording",
    (reason) => {
      const { container } = render(<CareerProgression progression={{ applicable: false, reason }} />);
      expect(screen.queryByRole("table")).toBeNull();
      expect(container.textContent).not.toMatch(/₹|\d/);
      expect(container.textContent).not.toMatch(/unavailable|failed to load/i);
      expect(container.querySelector("p")?.textContent?.length).toBeGreaterThan(20);
    },
  );
});

describe("CareerPathPanel with a progression", () => {
  const renderPanel = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CareerPathPanel offerId="o1" />
    </QueryClientProvider>,
  );

  it("renders the table above the two existing lists", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: {
      timeline: [{ year: 1, title: "Engineer", focus: "Learn" }],
      skillsToLearn: ["System Design"], potentialRoles: ["Staff Engineer"], progression: base,
    } } });
    renderPanel();
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getByText("Skills to build")).toBeTruthy();
    expect(screen.getByText("Roles this could lead to")).toBeTruthy();
  });

  it("the AI soft-error branch still shows the table plus the message", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: {
      timeline: [], skillsToLearn: [], potentialRoles: [], error: "AI down", progression: base,
    } } });
    renderPanel();
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getByText(/couldn.t generate a career path/)).toBeTruthy();
  });
});
