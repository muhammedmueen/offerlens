import { test, expect, type Page } from "@playwright/test";
import { CORPUS } from "../../backend/eval/corpus";

// upload -> results -> all four drawers -> compare (docs/LOCAL_DEVELOPMENT.md §8.1, §8.5, §8.5a).
// Phase 3's four contract breaks were each found by a human opening a drawer; this opens them.

const letter = (id: string) => CORPUS.find((c) => c.id === id)!.text;

/** Pastes a letter, fills the form, submits, and waits for the results page. */
async function analyse(page: Page, text: string) {
  await page.goto("/upload");
  await page.getByRole("tab", { name: "Paste Text" }).click();
  await page.getByPlaceholder(/Paste the text/).fill(text);
  await page.getByPlaceholder("e.g. Software Engineer").fill("Software Engineer");
  await page.getByPlaceholder("e.g. Bangalore").fill("Bangalore");
  await page.getByRole("combobox").first().click(); // experience level, options come from the API
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Analyze My Offer" }).click();

  await expect(page).toHaveURL(/\/offers\/[^/]+\/processing$/);
  // Processing page redirects itself on COMPLETED. Real Gemini call, so a long wait.
  await page.waitForURL(/\/offers\/[^/]+$/, { timeout: 150_000 });
  await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
  // The placeholders are what an empty analysis renders (§8.1).
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/^(Company|)$/);
}

/** Opens a drawer from the action bar, runs its check, and closes it. */
async function drawer(page: Page, opener: string | RegExp, title: string, check: (d: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("button", { name: opener }).click();
  const d = page.getByRole("dialog", { name: title });
  await expect(d).toBeVisible();
  await check(d);
  // Each panel sits in its own ErrorBoundary; its fallback is the regression.
  await expect(d.getByText(/unavailable|failed to load/i)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
}

test("upload -> results -> four drawers -> compare", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // Drawers are registered-only, and so is Compare.
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("e2e-password-1");
  await page.getByRole("button", { name: "Sign up free" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await analyse(page, letter("05-red-flag-heavy"));

  await drawer(page, "Generate Negotiation Email", "Negotiation Script", async (d) => {
    await d.getByRole("button", { name: "Generate Script" }).click();
    await expect(d.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 90_000 });
  });
  await drawer(page, "Calculate Full Benefits Value", "Benefits Calculator", async (d) => {
    await expect(d.getByText("Total compensation")).toBeVisible();
  });
  await drawer(page, /Career/, "Career Path", async (d) => {
    // The panel once dropped these two lists, so the timeline rendered without them.
    await expect(d.getByRole("heading", { name: "Skills to build" })).toBeVisible({ timeout: 90_000 });
    await expect(d.getByRole("heading", { name: "Roles this could lead to" })).toBeVisible();
  });
  await drawer(page, /Correct/, "Correct Data", async (d) => {
    // Pre-filled, and nothing to save until something changes (§8.5).
    await expect(d.getByLabel("Company name")).not.toHaveValue("");
    await expect(d.getByRole("button", { name: "No changes yet" })).toBeDisabled();
  });

  await analyse(page, letter("01-indian-product-clean"));

  // The results page's own Compare button (it was a no-op when signed in until the 4.8 follow-up).
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await page.getByRole("checkbox").nth(0).click();
  await page.getByRole("checkbox").nth(1).click();
  await page.getByRole("button", { name: "Compare Selected" }).click();

  // §8.5a: 1 overall + 5 rubric + 5 fact rows, then the verdict.
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await expect(page.getByText(/On the numbers/)).toBeVisible();

  expect(pageErrors).toEqual([]);
});
