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
});
