import type { Page } from "@playwright/test";
import {
  test,
  expect,
  API,
  apiError,
  fulfillJson,
  RED_FLAG_COMPANY,
  RED_FLAG_LETTER,
  seedOffer,
  signInNewAccount,
  toast,
} from "../support/fixtures";

// Guide §6.

const limitBody = (feature: string) =>
  apiError("QUOTA_EXCEEDED", "Daily limit", {
    feature,
    limit: 10,
    used: 10,
    remaining: 0,
    resetAt: "2030-01-01T18:30:00.000Z",
    plan: "free",
  });

async function openResults(page: Page) {
  const account = await signInNewAccount(page);
  const id = await seedOffer(page, RED_FLAG_LETTER, account);
  await page.goto(`/offers/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: RED_FLAG_COMPANY })).toBeVisible();
  return id;
}

async function open(page: Page, opener: string, title: string) {
  await page.getByRole("button", { name: opener, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: title });
  await expect(drawer).toBeVisible();
  return drawer;
}

const noFallback = async (drawer: import("@playwright/test").Locator) => {
  await expect(drawer.getByText(/unavailable|failed to load|Something went wrong/i)).toHaveCount(0);
};

test("§6 negotiation: generate a script for a chosen tone and copy it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openResults(page);
  const drawer = await open(page, "Generate Negotiation Email", "Negotiation Script");

  await drawer.getByRole("combobox").click();
  await page.getByRole("option").last().click();
  await drawer.getByRole("button", { name: "Generate Script" }).click();

  await expect(drawer.getByText(/^Subject: /)).toBeVisible();
  await drawer.getByRole("button", { name: "Copy" }).click();
  await expect(toast(page, "Copied!")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Dear Hiring Manager");
  await noFallback(drawer);
});

test("§6 negotiation: needs at least one focus area", async ({ page }) => {
  await openResults(page);
  const drawer = await open(page, "Generate Negotiation Email", "Negotiation Script");
  const areas = drawer.getByRole("checkbox");
  for (let i = 0; i < (await areas.count()); i++) {
    if ((await areas.nth(i).getAttribute("aria-checked")) === "true") await areas.nth(i).click();
  }
  await expect(drawer.getByRole("button", { name: "Generate Script" })).toBeDisabled();
});

test("gap: negotiation at its daily limit says when it resets", async ({ page, expectedConsole }) => {
  expectedConsole.allow(/status of 429 /);
  const id = await openResults(page);
  await page.route(`${API}/offers/${id}/negotiate`, (route) => fulfillJson(route, 429, limitBody("negotiation")));
  const drawer = await open(page, "Generate Negotiation Email", "Negotiation Script");
  await drawer.getByRole("button", { name: "Generate Script" }).click();
  await expect(drawer.getByRole("alert")).toContainText("You've reached today's limit of 10 negotiation scripts.");
});

test("§6 benefits: shows the totals and recalculates an edited amount", async ({ page }) => {
  await openResults(page);
  const drawer = await open(page, "Calculate Full Benefits Value", "Benefits Calculator");
  await expect(drawer.getByText("Benefits value")).toBeVisible();
  await expect(drawer.getByText("Total compensation")).toBeVisible();

  const amount = drawer.getByRole("spinbutton").first();
  await amount.fill("54321");
  await drawer.getByRole("button", { name: "Recalculate with my values" }).click();
  await expect(drawer.getByText("₹54,321").first()).toBeVisible();
  await noFallback(drawer);
});

test("§6 benefits: a total above CTC is called out", async ({ page }) => {
  await openResults(page);
  const drawer = await open(page, "Calculate Full Benefits Value", "Benefits Calculator");
  await drawer.getByRole("spinbutton").first().fill("99999999");
  await drawer.getByRole("button", { name: "Recalculate with my values" }).click();
  await expect(drawer.getByRole("note")).toContainText("add up to more than your total CTC");
});

test("§6 career: timeline, skills, next roles and a labelled pay table", async ({ page }) => {
  await openResults(page);
  const drawer = await open(page, "Career", "Career Path");

  await expect(drawer.getByRole("heading", { name: "Skills to build" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Roles this could lead to" })).toBeVisible();
  await expect(drawer.getByText("Senior Software Engineer").first()).toBeVisible();
  await expect(drawer.getByText("A projected five-year trajectory")).toBeVisible();

  // Gap in the guide: this table holds modelled numbers, so it needs the honest-labelling check too.
  await expect(drawer.getByRole("heading", { name: "Pay by years of experience" })).toBeVisible();
  await expect(drawer.getByText("Modelled").first()).toBeVisible();
  await noFallback(drawer);
});

test("gap: career at its daily limit says so, with no pointless retry", async ({ page, expectedConsole }) => {
  expectedConsole.allow(/status of 429 /);
  const id = await openResults(page);
  await page.route(new RegExp(`/offers/${id}/career`), (route) => fulfillJson(route, 429, limitBody("career")));
  const drawer = await open(page, "Career", "Career Path");
  await expect(drawer.getByText(/You've reached today's limit of 10 career paths\./)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("§6 corrections: pre-filled, then a saved change updates the page", async ({ page }) => {
  await openResults(page);
  let drawer = await open(page, "Correct", "Correct Data");

  await expect(drawer.getByLabel("Company name")).toHaveValue(RED_FLAG_COMPANY);
  await expect(drawer.getByLabel("Total CTC")).toHaveValue("2800000");
  await expect(drawer.getByRole("button", { name: "No changes yet" })).toBeDisabled();

  await drawer.getByLabel("Company name").fill("Corrected Name Ltd");
  await drawer.getByRole("button", { name: "Save 1 correction" }).click();
  await expect(toast(page, "Corrections applied")).toBeVisible();
  // Not by role: the open drawer marks the page behind it aria-hidden.
  await expect(page.locator("h1", { hasText: "Corrected Name Ltd" })).toBeAttached();

  // Survives a reload: it was written, not just shown.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Corrected Name Ltd" })).toBeVisible();
  drawer = await open(page, "Correct", "Correct Data");
  await expect(drawer.getByText("1 correction previously submitted for this offer.")).toBeVisible();
});

const DRAWERS = [
  ["Generate Negotiation Email", "Negotiation Script"],
  ["Calculate Full Benefits Value", "Benefits Calculator"],
  ["Career", "Career Path"],
  ["Correct", "Correct Data"],
];

test("§6 every drawer opens from the keyboard and closes on Escape", async ({ page }) => {
  await openResults(page);
  for (const [opener, title] of DRAWERS) {
    await page.getByRole("button", { name: opener, exact: true }).focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: title });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
});

test("§6 closing a drawer hands focus back to its opener", async ({ page }) => {
  await openResults(page);
  for (const [opener, title] of DRAWERS) {
    const button = page.getByRole("button", { name: opener, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: title });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(button).toBeFocused();
  }
});
