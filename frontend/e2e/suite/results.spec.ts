import type { Page } from "@playwright/test";
import {
  test,
  expect,
  API,
  CLEAN_COMPANY,
  CLEAN_LETTER,
  RED_FLAG_COMPANY,
  RED_FLAG_LETTER,
  seedOffer,
  signInNewAccount,
  toast,
} from "../support/fixtures";

// Guide §5c and §5d.

async function openResults(page: Page, letterId = RED_FLAG_LETTER) {
  const account = await signInNewAccount(page);
  const id = await seedOffer(page, letterId, account);
  await page.goto(`/offers/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return id;
}

/** Runs the real analysis response through `edit`, for states the mock never produces. */
const patchAnalysis = (page: Page, edit: (data: Record<string, unknown>) => void) =>
  page.route(`${API}/offers/*/analysis`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    edit(json.data);
    await route.fulfill({ response, json });
  });

test.describe("what the page shows", () => {
  test("§5c every section renders with the letter's values", async ({ page }) => {
    await openResults(page);

    await expect(page.getByRole("heading", { level: 1, name: RED_FLAG_COMPANY })).toBeVisible();
    await expect(page.getByText("Software Engineer · Bangalore")).toBeVisible();
    await expect(page.getByText("poor", { exact: true })).toBeVisible();
    for (const heading of [
      "How this score was reached",
      "Salary Comparison",
      "Red Flags",
      "Negotiation Tips",
      "Estimated Take-Home",
      "Benefits Overview",
      "Against a standard offer",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    // These two come from rules over the letter text, so they hold on the mock too.
    await expect(page.getByRole("heading", { name: "Post-employment non-compete" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Termination during probation without notice" })).toBeVisible();
    await expect(page.getByText("Base salary")).toBeVisible();
  });

  test("§5c a clean letter differs: fewer flags and a better score", async ({ page }) => {
    await openResults(page, CLEAN_LETTER);
    await expect(page.getByRole("heading", { level: 1, name: CLEAN_COMPANY })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Post-employment non-compete" })).toHaveCount(0);
    await expect(page.getByText("3 of 3 essentials")).toBeVisible();
  });

  test("§5c the score is the weighted sum of its rows, not their total", async ({ page }) => {
    await openResults(page);
    const rows = page.getByRole("listitem").filter({ hasText: /% of total/ });
    await expect(rows).toHaveCount(5);

    let weighted = 0;
    for (const text of await rows.allInnerTexts()) {
      const scored = /(\d+)\/100\s*·\s*(\d+)% of total/.exec(text);
      if (scored) weighted += Number(scored[1]) * Number(scored[2]);
    }

    const gauge = await page.getByRole("img", { name: /^Score \d+ out of 100$/ }).getAttribute("aria-label");
    const score = Number(/\d+/.exec(gauge!)![0]);
    expect(Math.abs(weighted / 100 - score)).toBeLessThanOrEqual(1);
  });
});

test.describe("honest labelling", () => {
  test("§5c a take-home with no stated basic is an upper bound and says so", async ({ page }) => {
    await openResults(page);
    await expect(page.getByText(/^up to ₹/)).toBeVisible();
    await expect(page.getByText(/^Upper bound\./)).toBeVisible();

    const assumptions = page.getByText(/^What this assumes \(\d+\)$/);
    await assumptions.click();
    await expect(page.locator("details[open] li").first()).toBeVisible();
  });

  test("§5c the benchmark is labelled as modelled survey data", async ({ page }) => {
    await openResults(page);
    const source = page.getByRole("complementary", { name: "Salary benchmark source" });
    await expect(source).toContainText("Modelled");
    await expect(source).toContainText(/Public survey, (India-wide|adjusted for )/);
  });

  test("§5c an AI-estimated benchmark says it is not benchmarked", async ({ page }) => {
    await patchAnalysis(page, (d) => {
      (d.salaryComparison as Record<string, unknown>).dataSource = "ai_estimated";
    });
    await openResults(page);
    await expect(page.getByText("AI-estimated range — not benchmarked against real submissions")).toBeVisible();
  });

  test("§5c low-confidence analyses carry their caveat", async ({ page }) => {
    await patchAnalysis(page, (d) => {
      d.lowConfidence = true;
      d.ocrConfidence = 0.42;
      d.scoringMethod = "fallback";
      d.scoreNote = null;
      (d.confidence as Record<string, unknown>).caveat = "This came from a scanned copy.";
    });
    await openResults(page);
    await expect(page.getByText("This came from a scanned copy.")).toBeVisible();
    await expect(page.getByText(/We had trouble reading parts of your offer \(42%/)).toBeVisible();
    await expect(page.getByText("Estimated score — limited market data")).toBeVisible();
  });

  test("§5c Salary Comparison is absent, not broken, without all four percentiles", async ({ page }) => {
    await patchAnalysis(page, (d) => {
      (d.salaryComparison as { marketRange: Record<string, unknown> }).marketRange.p90 = null;
    });
    await openResults(page);
    await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Salary Comparison" })).toHaveCount(0);
  });
});

test.describe("actions", () => {
  // KNOWN BUG, found by this suite. The report route pipes to reply.raw, which skips every header
  // Fastify set, including CORS and Content-Type. Live is same-origin so it still works there, but
  // local dev and a separately hosted API get "Download failed". Delete test.fail() once it uses
  // reply.send(doc).
  test("§5d PDF downloads when the API is on another origin", async ({ page, expectedConsole }) => {
    test.fail();
    expectedConsole.allow(/CORS policy|ERR_FAILED/);
    const id = await openResults(page);

    const download = page.waitForEvent("download", { timeout: 10_000 });
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    expect((await download).suggestedFilename()).toBe(`offerlens-report-${id}.pdf`);
  });

  test("§5d a failed PDF download says so", async ({ page, context, expectedConsole }) => {
    expectedConsole.allow(/CORS policy|ERR_INTERNET_DISCONNECTED|ERR_FAILED/);
    await openResults(page);

    await context.setOffline(true);
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await expect(toast(page, "Download failed")).toBeVisible();
    await context.setOffline(false);
  });

  test("§5d Share copies this page's URL", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openResults(page);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(toast(page, "Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });

  test("§5d Share explains a blocked clipboard", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
    });
    await openResults(page);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(toast(page, "Could not copy link")).toBeVisible();
  });

  test("§4b Share is not gated for guests", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const id = await seedOffer(page, CLEAN_LETTER);
    await page.goto(`/offers/${id}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(toast(page, "Link copied")).toBeVisible();
  });
});

test.describe("contribution card", () => {
  const card = (page: Page) => page.getByRole("region", { name: "Help others see real offers" });

  test("§5d nothing is sent until asked, and a company name is refused", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/salaries")) posts.push(r.url());
    });
    await openResults(page);
    await card(page).getByRole("button", { name: "Review and share" }).click();

    const title = card(page).getByLabel("Job title");
    await expect(title).toHaveValue("Software Engineer");
    await title.fill(RED_FLAG_COMPANY);
    await title.blur();
    await expect(card(page).getByText("Remove the company name")).toBeVisible();
    expect(posts).toEqual([]);

    await title.fill("Software Engineer");
    await card(page).getByLabel("Years of experience").fill("6");
    await card(page).getByRole("combobox", { name: "Company type" }).click();
    await page.getByRole("option").first().click();
    await card(page).getByRole("button", { name: "Send data point" }).click();
    await expect(card(page).getByText(/^Thank you\. Your data point is added without your name\./)).toBeVisible();
    expect(posts).toHaveLength(1);
  });

  test("§5d 'No thanks' sticks for this offer", async ({ page }) => {
    await openResults(page);
    await card(page).getByRole("button", { name: "No thanks" }).click();
    await expect(card(page).getByText("Got it. We will not ask again for this offer.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});
