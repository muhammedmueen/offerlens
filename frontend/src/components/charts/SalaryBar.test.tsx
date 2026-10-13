import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// jsdom has no layout, so ResponsiveContainer would render nothing. Stand-ins keep the data and the reference line.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: { name: string; value: number }[]; children: React.ReactNode }) => (
    <div>
      <ul data-testid="range">{data.map((d) => <li key={d.name}>{d.name}</li>)}</ul>
      {children}
    </div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ label }: { label: { value: string } }) => <div data-testid="offer-marker">{label.value}</div>,
}));

const { default: SalaryBar } = await import("./SalaryBar");

afterEach(cleanup);

const range = { p25: 1, p50: 2, p75: 3, p90: 4, userSalary: 2_400_000 };

describe("SalaryBar offer marker", () => {
  it("draws the offer marker when the offer was ranked", () => {
    render(<SalaryBar {...range} />);
    expect(screen.getByTestId("offer-marker").textContent).toBe("Your Offer");
  });

  it("draws no marker and no 'offer' text when the percentile is withheld, but keeps the range", () => {
    const { container } = render(<SalaryBar {...range} hideOffer />);
    expect(screen.queryByTestId("offer-marker")).toBeNull();
    expect(container.textContent).not.toMatch(/offer/i);
    expect(Array.from(screen.getByTestId("range").children).map((li) => li.textContent)).toEqual(["P25", "Median", "P75", "P90"]);
  });
});
