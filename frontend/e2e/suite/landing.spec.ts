import { test, expect, signInNewAccount } from "../support/fixtures";

// Guide §1 and §3.

test.describe("landing page", () => {
  test("§1/§3 renders styled, with the hero and every section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Is this offer actually good?" })).toBeVisible();
    await expect(page.getByText("Modelled numbers stay labelled.")).toBeVisible();
    for (const heading of [
      "Three steps, no account needed",
      "What a verdict looks like",
      "The clauses most people skim past",
      "See what your letter really says",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    // Tailwind failing to load leaves the default transparent background on the CTA.
    await expect(page.getByRole("button", { name: "Drop or paste your offer" }).first()).toHaveCSS(
      "background-color",
      "rgb(14, 116, 144)",
    );
  });

  test("§3 navbar and footer links, as a guest", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    for (const name of ["Upload", "Forum", "Salaries", "Requests"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    await expect(nav.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sign up" })).toBeVisible();

    const footer = page.getByRole("contentinfo");
    for (const [name, href] of [
      ["Forum", "/forum"],
      ["Salaries", "/salaries"],
      ["Feedback", "/feature-requests"],
    ]) {
      await expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    const credit = footer.getByRole("link", { name: /Built by Mueen/ });
    await expect(credit).toHaveAttribute("href", /^https:\/\/mueens\.tech/);
    await expect(credit).toHaveAttribute("target", "_blank");
  });

  test("§3 both calls to action go to /upload", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("button", { name: "Drop or paste your offer" });
    await expect(cta).toHaveCount(2);

    await cta.first().click();
    await expect(page).toHaveURL(/\/upload$/);

    await page.goto("/");
    await cta.last().click();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("signed-in navbar swaps Log in for Dashboard and the account menu", async ({ page }) => {
    const account = await signInNewAccount(page);
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Log in" })).toHaveCount(0);

    await nav.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: account.email })).toBeVisible();
  });
});

test.describe("mobile width", () => {
  const noSidewaysScroll = (page: import("@playwright/test").Page) =>
    expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(0);

  test("§3 landing has no horizontal overflow @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test("§3 the menu button opens working links and closes on navigation @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Forum" })).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("banner").getByRole("link", { name: "Forum" }).click();

    await expect(page).toHaveURL(/\/forum$/);
    const menu = page.getByRole("button", { name: "Open menu" });
    // The heading means the new page has mounted; the outgoing navbar then leaves with the crossfade.
    await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
    await expect(menu).toHaveCount(1);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  test("§14 results, salaries and upload fit a phone @mobile", async ({ page }) => {
    for (const path of ["/upload", "/salaries", "/forum", "/feature-requests", "/login"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
    }
  });
});
