import type { Page } from "@playwright/test";
import { test, expect, API, apiError, CLEAN_LETTER, fulfillJson, seedOffer, signInNewAccount } from "../support/fixtures";

// Guide §5b, §5b-giveup and the FAILED half of §12. The mock answers too fast to watch the page, and
// a real FAILED or a 5-minute wait cannot be forced, so these stub the one status endpoint.

const FAKE_ID = "00000000-0000-4000-8000-000000000001";
const statusBody = (status: string, failureReason?: string) => ({
  success: true,
  data: { id: FAKE_ID, status, failureReason: failureReason ?? null },
});

const stubStatus = (page: Page, status: string, failureReason?: string) =>
  page.route(`${API}/offers/${FAKE_ID}`, (route) => fulfillJson(route, 200, statusBody(status, failureReason)));

test.describe("while processing", () => {
  test("§5b shows the steps, advances by itself, polls gently and Back skips it", async ({ page }) => {
    const account = await signInNewAccount(page);
    const id = await seedOffer(page, CLEAN_LETTER, account);

    let polls = 0;
    await page.route(`${API}/offers/${id}`, (route) => {
      polls += 1;
      if (polls >= 3) return route.continue();
      return fulfillJson(route, 200, { success: true, data: { id, status: polls === 1 ? "QUEUED" : "PROCESSING" } });
    });

    await page.goto("/");
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, `/offers/${id}/processing`);

    await expect(page.getByRole("heading", { name: "Reading your offer…" })).toBeVisible();
    for (const step of ["Uploading", "Reading Document", "Analyzing", "Scoring"]) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Usually takes 15–30 seconds")).toBeVisible();

    await expect(page).toHaveURL(new RegExp(`/offers/${id}$`), { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
    // 3s apart: a storm would be dozens, and polling must stop on COMPLETED.
    expect(polls).toBeLessThanOrEqual(4);

    await page.goBack();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("gap: opening /processing for a finished offer goes straight to results", async ({ page }) => {
    const account = await signInNewAccount(page);
    const id = await seedOffer(page, CLEAN_LETTER, account);
    await page.goto(`/offers/${id}/processing`);
    await expect(page).toHaveURL(new RegExp(`/offers/${id}$`));
  });

  test("§5b the wait message changes at 30s and 60s", async ({ page }) => {
    await page.clock.install();
    await stubStatus(page, "PROCESSING");
    await page.goto(`/offers/${FAKE_ID}/processing`);
    await expect(page.getByRole("status").filter({ hasText: "Usually takes" })).toBeAttached();

    await page.clock.runFor(31_000);
    await expect(page.getByText("Taking a bit longer than usual…")).toBeAttached();
    await page.clock.runFor(30_000);
    await expect(page.getByText("Still working on it. We'll keep trying.")).toBeAttached();
  });

  test("§5b-giveup a guest gets 'Check again', which resumes polling", async ({ page }) => {
    await page.clock.install();
    await stubStatus(page, "QUEUED");
    await page.goto(`/offers/${FAKE_ID}/processing`);
    await expect(page.getByRole("status").filter({ hasText: "Usually takes" })).toBeAttached();

    await page.clock.runFor(301_000);
    await expect(page.getByText(/Keep this page open and check again in a minute\./)).toBeAttached();
    await expect(page.getByRole("button", { name: "Try Again" })).toBeAttached();

    let polled = false;
    page.on("request", (r) => {
      if (r.url().endsWith(`/offers/${FAKE_ID}`)) polled = true;
    });
    await page.getByRole("button", { name: "Check again" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Check again" })).toHaveCount(0);
    await page.clock.runFor(4_000);
    await expect.poll(() => polled).toBe(true);
  });

  test("§5b-giveup a member is sent to the dashboard instead", async ({ page }) => {
    await signInNewAccount(page);
    await page.clock.install();
    await stubStatus(page, "QUEUED");
    await page.goto(`/offers/${FAKE_ID}/processing`);
    await expect(page.getByRole("status").filter({ hasText: "Usually takes" })).toBeAttached();

    await page.clock.runFor(301_000);
    await expect(page.getByText(/Refresh in a minute, or check your dashboard\./)).toBeAttached();
    await expect(page.getByRole("button", { name: "Go to Dashboard" })).toBeAttached();
    await expect(page.getByRole("button", { name: "Check again" })).toHaveCount(0);
  });

  test("§5b-giveup a failed status request can be retried", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 500 /);
    let fail = true;
    await page.route(`${API}/offers/${FAKE_ID}`, (route) =>
      fail
        ? fulfillJson(route, 500, apiError("INTERNAL_ERROR", "Boom"))
        : fulfillJson(route, 200, statusBody("PROCESSING")),
    );
    await page.goto(`/offers/${FAKE_ID}/processing`);
    await expect(page.getByText("Could not load status.")).toBeVisible();

    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Reading your offer…" })).toBeVisible();
  });
});

test.describe("failed analyses", () => {
  test("§12 shows the reason and a way back", async ({ page }) => {
    await stubStatus(page, "FAILED", "AI_ERROR: The model could not read this letter.");
    await page.goto(`/offers/${FAKE_ID}/processing`);

    await expect(page.getByRole("heading", { level: 1, name: "Analysis Failed" })).toBeVisible();
    await expect(page.getByText("The model could not read this letter.")).toBeVisible();
    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("§12 the rate-limit variant gives advice a production user can follow", async ({ page }) => {
    await stubStatus(page, "FAILED", "RATE_LIMIT: Too many requests to the model.");
    await page.goto(`/offers/${FAKE_ID}/processing`);

    await expect(page.getByRole("heading", { level: 1, name: "Rate Limit Exceeded" })).toBeVisible();
    await expect(page.getByText("Wait 2-3 minutes before trying again")).toBeVisible();
    // Both point at the dev-only model picker.
    await expect(page.getByRole("button", { name: "Change Model" })).toHaveCount(0);
    await expect(page.getByText(/model selector/)).toHaveCount(0);
  });
});
