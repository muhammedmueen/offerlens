import type { Page } from "@playwright/test";
import {
  test,
  expect,
  API,
  apiError,
  CLEAN_COMPANY,
  CLEAN_LETTER,
  fulfillJson,
  RED_FLAG_COMPANY,
  RED_FLAG_LETTER,
  seedOffer,
  signInNewAccount,
} from "../support/fixtures";

// Guide §8 and §9.

/** The free plan's 3 analyses a day rules out seeding what a long list needs, so this one is stubbed. */
const stubOfferList = (page: Page, offers: unknown[], totalPages = 1) =>
  page.route(new RegExp(`${API}/users/me/offers`), (route) =>
    fulfillJson(route, 200, {
      success: true,
      data: { offers, pagination: { page: 1, limit: 20, total: offers.length, totalPages } },
    }),
  );

const listedOffer = (n: number, status = "COMPLETED") => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  status,
  company: `Company ${n}`,
  role: "Engineer",
  score: 50 + n,
  createdAt: "2026-01-01T00:00:00.000Z",
});

test.describe("dashboard", () => {
  test("§8 a new account gets the empty state and a way forward", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/dashboard");

    await expect(page.getByText("No analyses yet")).toBeVisible();
    await page.getByRole("button", { name: "Upload Your First Offer" }).click();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("§8 stats and rows reflect real analyses, and rows open results", async ({ page }) => {
    const account = await signInNewAccount(page);
    const id = await seedOffer(page, RED_FLAG_LETTER, account);
    await page.goto("/dashboard");

    for (const label of ["Total Offers", "Analysed", "Avg Score", "Best Score"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Total Offers").locator("../..")).toContainText("1");

    await page.getByRole("link", { name: RED_FLAG_COMPANY }).click();
    await expect(page).toHaveURL(new RegExp(`/offers/${id}$`));
  });

  test("§8 unfinished rows open the processing page", async ({ page }) => {
    await signInNewAccount(page);
    await stubOfferList(page, [listedOffer(1, "PROCESSING")]);
    await page.route(`${API}/offers/${listedOffer(1).id}`, (route) =>
      fulfillJson(route, 200, { success: true, data: { id: listedOffer(1).id, status: "PROCESSING" } }),
    );
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Company 1" }).click();
    await expect(page).toHaveURL(new RegExp(`/offers/${listedOffer(1).id}/processing$`));
  });

  test("§8 sorting by score reorders the table", async ({ page }) => {
    const account = await signInNewAccount(page);
    await seedOffer(page, CLEAN_LETTER, account);
    await seedOffer(page, RED_FLAG_LETTER, account);
    await page.goto("/dashboard");

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText(RED_FLAG_COMPANY); // newest
    await page.getByRole("button", { name: "Score", exact: true }).click();
    await expect(firstRow).toContainText(CLEAN_COMPANY); // better score
  });

  test("§8 pagination appears only past one page", async ({ page }) => {
    await signInNewAccount(page);
    await stubOfferList(page, [listedOffer(1)], 2);
    await page.goto("/dashboard");
    await expect(page.getByText("1 / 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prev" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("§8 buttons lead on, and the quota lives on /upload, not here", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Offer History" })).toBeVisible();
    await expect(page.getByText(/analyses left today/)).toHaveCount(0);

    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\/compare$/);
    await page.goBack();
    await page.getByRole("button", { name: "Upload New" }).click();
    await expect(page).toHaveURL(/\/upload$/);
  });
});

test.describe("compare", () => {
  test("§9 fewer than two offers gets a prompt, not a broken table", async ({ page }) => {
    const account = await signInNewAccount(page);
    await seedOffer(page, CLEAN_LETTER, account);
    await page.goto("/compare");

    await expect(page.getByText("You need at least 2 completed analyses to compare.")).toBeVisible();
    await page.getByRole("button", { name: "Upload Another Offer" }).click();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("§9 two offers give the 11-row table, winners and a verdict", async ({ page }) => {
    const account = await signInNewAccount(page);
    const id = await seedOffer(page, RED_FLAG_LETTER, account);
    await seedOffer(page, CLEAN_LETTER, account);

    await page.goto(`/offers/${id}`);
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(page).toHaveURL(/\/compare$/);

    const submit = page.getByRole("button", { name: "Compare Selected" });
    await expect(submit).toBeDisabled();
    await page.getByRole("checkbox").nth(0).click();
    await expect(submit).toBeDisabled();
    await page.getByRole("checkbox").nth(1).click();
    await submit.click();

    await expect(page.locator("tbody tr")).toHaveCount(11);
    await expect(page.getByRole("columnheader", { name: new RegExp(RED_FLAG_COMPANY) })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: new RegExp(CLEAN_COMPANY) })).toBeVisible();
    await expect(page.getByLabel("best value").first()).toBeVisible();
    await expect(page.getByText(`On the numbers: ${CLEAN_COMPANY}`)).toBeVisible();
  });

  test("gap: a fourth selection is ignored", async ({ page }) => {
    await signInNewAccount(page);
    await stubOfferList(page, [1, 2, 3, 4].map((n) => listedOffer(n)));
    await page.goto("/compare");

    const boxes = page.getByRole("checkbox");
    for (const i of [0, 1, 2, 3]) await boxes.nth(i).click();

    await expect(boxes.nth(2)).toBeChecked();
    await expect(boxes.nth(3)).not.toBeChecked();
  });

  test("gap: a failed comparison shows an error and keeps the selection", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 500 /);
    const account = await signInNewAccount(page);
    await seedOffer(page, RED_FLAG_LETTER, account);
    await seedOffer(page, CLEAN_LETTER, account);
    await page.route(`${API}/offers/compare`, (route) => fulfillJson(route, 500, apiError("INTERNAL_ERROR", "Boom")));
    await page.goto("/compare");

    await page.getByRole("checkbox").nth(0).click();
    await page.getByRole("checkbox").nth(1).click();
    await page.getByRole("button", { name: "Compare Selected" }).click();

    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
    await expect(page.getByRole("checkbox").nth(0)).toBeChecked();
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });
});
