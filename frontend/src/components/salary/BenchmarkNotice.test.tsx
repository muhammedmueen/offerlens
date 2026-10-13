import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BenchmarkNotice from "./BenchmarkNotice";
import { ODBL_URL, PLFS_CITATION_TEXT, PLFS_DATASET_URL, PLFS_URL, SO_SURVEY_URL } from "@/constants/attribution";

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

  it("5.1b: city-adjusted survey shows the label, factor, PLFS n, both citations as real links, and never says verified", () => {
    const { container } = render(
      <BenchmarkNotice
        dataSource="public_survey"
        sampleSize={39}
        disclaimer="Modelled from public surveys, not offers in your city. This is an estimate."
        cityAdjustment={{ cityLabel: "Mumbai", factor: 0.79, plfsSampleSize: 31 }}
      />,
    );
    expect(screen.getByText("Public survey, adjusted for Mumbai")).toBeTruthy();
    expect(screen.getByText(/City factor x0\.79 from PLFS 2023-24 \(n = 31\)/)).toBeTruthy();
    expect(container.textContent).toContain(PLFS_CITATION_TEXT);
    const links = Array.from(container.querySelectorAll("a"));
    const hrefs = links.map((a) => a.getAttribute("href"));
    for (const h of [SO_SURVEY_URL, ODBL_URL, PLFS_URL, PLFS_DATASET_URL]) expect(hrefs).toContain(h);
    expect(links.every((a) => a.getAttribute("rel") === "noopener noreferrer")).toBe(true);
    expect(container.textContent).not.toMatch(/verified|crowdsourced|submission/i);
  });

  it("5.1b: without cityAdjustment there is no PLFS text or link", () => {
    const { container } = render(<BenchmarkNotice dataSource="public_survey" sampleSize={39} disclaimer="x" />);
    expect(container.textContent).not.toMatch(/PLFS|Labour Force/);
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
