import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BenchmarkNotice from "./BenchmarkNotice";
import { ODBL_URL, SO_SURVEY_URL } from "@/constants/attribution";

afterEach(cleanup);

describe("BenchmarkNotice", () => {
  it("labels survey data as modelled, India-wide, with real attribution links", () => {
    const { container } = render(
      <BenchmarkNotice
        dataSource="public_survey"
        sampleSize={39}
        disclaimer="Modelled from public surveys, not offers in your city. India-wide benchmark."
      />,
    );
    expect(screen.getByText("Public survey, India-wide")).toBeTruthy();
    expect(screen.getByText(/Modelled from public surveys, not offers in your city/)).toBeTruthy();
    expect(screen.getByText("n = 39 respondents")).toBeTruthy();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(SO_SURVEY_URL);
    expect(hrefs).toContain(ODBL_URL);
    expect(container.querySelectorAll("a[rel='noopener noreferrer'][target='_blank']").length).toBe(3);
    // Modelled numbers are never described as submissions.
    expect(container.textContent).not.toMatch(/verified|crowdsourced|submission/i);
  });

  it("keeps crowdsourced and AI-estimated wording, without attribution", () => {
    const { container, rerender } = render(<BenchmarkNotice dataSource="crowdsourced" sampleSize={12} />);
    expect(container.textContent).toContain("Based on crowdsourced submissions (n = 12)");
    rerender(<BenchmarkNotice dataSource="something_new" />);
    expect(container.textContent).toContain("AI-estimated range");
    expect(container.querySelector("a")).toBeNull();
  });

  it.each([
    ["offered", null, "offered pay"],
    ["current", null, "current pay"],
    ["mixed", { offered: 9, current: 4, unlabelled: 2 }, "offered and current pay mixed"],
    ["mixed", { offered: 9, current: 0, unlabelled: 6 }, "offered pay and unlabelled"],
    ["mixed", { offered: 0, current: 4, unlabelled: 8 }, "current pay and unlabelled"],
    ["mixed", { offered: 0, current: 0, unlabelled: 12 }, "pay type not recorded"],
  ] as const)("labels crowd pay %s %j as %s", (payBasis, payMix, label) => {
    const { container } = render(
      <BenchmarkNotice dataSource="crowdsourced" sampleSize={15} payBasis={payBasis} payMix={payMix} disclaimer="12 of 15 data points are offered pay." />,
    );
    expect(container.textContent).toContain(`Based on crowdsourced submissions (n = 15), ${label}`);
    expect(container.textContent).toContain("12 of 15 data points are offered pay.");
  });

  it("prints the stored survey disclaimer, including the Fresher 'not ranked' wording", () => {
    const text = "Modelled from public surveys, not offers in your city. Survey figures describe current pay. "
      + "The survey has no respondents for this role with 0 years of experience, so this range covers all experience levels "
      + "and is shown for information only. Your offer is not ranked against it, and salary is left out of the score.";
    render(<BenchmarkNotice dataSource="public_survey" sampleSize={39} disclaimer={text} />);
    expect(screen.getByText(/Survey figures describe current pay/)).toBeTruthy();
    expect(screen.getByText(/Your offer is not ranked against it/)).toBeTruthy();
  });
});
