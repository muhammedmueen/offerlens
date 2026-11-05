import {
  test,
  expect,
  analyseViaUi,
  CLEAN_COMPANY,
  CLEAN_LETTER,
  fillPasteForm,
  flushRateLimits,
  letter,
  otherBrowser,
  PASSWORD,
  RED_FLAG_COMPANY,
  RED_FLAG_LETTER,
  seedOffer,
  uniqueEmail,
} from "../support/fixtures";

// Guide §4. A fresh browser context is a fresh guest with its own quota, so nothing here needs setup.

test.describe("guest quota", () => {
  test("§4a one analysis, then the exhausted box and a disabled button", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByText("1 of 1 analysis left today")).toBeVisible();

    await analyseViaUi(page, CLEAN_LETTER);

    await page.goto("/upload");
    await expect(
      page.getByText(
        "You've used today's free analysis. It resets at 12:00 am IST. Create a free account to get 3 analyses a day.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Create free account" })).toHaveAttribute("href", "/signup");

    await fillPasteForm(page, letter(RED_FLAG_LETTER));
    await expect(page.getByRole("button", { name: "Analyze My Offer" })).toBeDisabled();
  });
});

test.describe("guest results page", () => {
  test("§4b shows the banner with the time left", async ({ page }) => {
    const id = await seedOffer(page, CLEAN_LETTER);
    await page.goto(`/offers/${id}`);
    await expect(page.getByText(/^\d+h left$/)).toBeVisible();
    await expect(page.getByText("Sign up to save this analysis, compare offers, and get negotiation scripts.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Free Account" })).toBeVisible();
  });

  const gated: Array<[string, string]> = [
    ["Generate Negotiation Email", "Negotiation Scripts"],
    ["Calculate Full Benefits Value", "Benefits Calculator"],
    ["Career", "Career Path"],
    ["Correct", "Corrections"],
    ["Compare", "Compare Offers"],
    ["PDF", "PDF Download"],
  ];

  test("§4b every registered-only action opens the gate naming its feature", async ({ page }) => {
    const id = await seedOffer(page, CLEAN_LETTER);
    await page.goto(`/offers/${id}`);

    for (const [button, feature] of gated) {
      await page.getByRole("button", { name: button, exact: true }).click();
      const gate = page.getByRole("dialog", { name: "Create a Free Account" });
      await expect(gate).toContainText(`Sign up to unlock ${feature}, save your analyses, and more.`);
      await page.keyboard.press("Escape");
      await expect(gate).toBeHidden();
    }
    await expect(page).toHaveURL(new RegExp(`/offers/${id}$`));
  });

  test("§4c another browser cannot read a guest's analysis", async ({ page, browser }) => {
    const id = await seedOffer(page, CLEAN_LETTER);
    const other = await otherBrowser(browser);

    await other.page.goto(`/offers/${id}`);
    await expect(other.page.getByRole("heading", { name: "This analysis isn't ready or isn't available" })).toBeVisible();
    await expect(other.page.getByRole("link", { name: "Check its progress" })).toBeVisible();
    await expect(other.page.getByText(CLEAN_COMPANY)).toHaveCount(0);
    await other.context.close();
  });
});

test.describe("protected pages", () => {
  for (const path of ["/dashboard", "/compare"]) {
    test(`§4d ${path} redirects to login and comes back`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?returnUrl=%2F${path.slice(1)}$`));

      // A real account, created without touching this browser's session.
      flushRateLimits();
      const email = uniqueEmail();
      await page.request.post("http://localhost:8100/api/v1/auth/signup", { data: { email, password: PASSWORD } });

      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Log in", exact: true }).last().click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }
});

test.describe("claiming guest offers", () => {
  test("§4e signing up from the banner moves the analysis to the dashboard", async ({ page }) => {
    await analyseViaUi(page, RED_FLAG_LETTER);

    await page.getByRole("link", { name: "Create Free Account", exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
    flushRateLimits();
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up free" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: RED_FLAG_COMPANY })).toBeVisible();
  });

  test("§4e signing up in the gate stays on the page and unlocks it", async ({ page }) => {
    await analyseViaUi(page, RED_FLAG_LETTER);
    const results = page.url();

    await page.getByRole("button", { name: "Career", exact: true }).click();
    const gate = page.getByRole("dialog", { name: "Create a Free Account" });
    flushRateLimits();
    await gate.getByLabel("Email").fill(uniqueEmail());
    await gate.getByLabel("Password").fill(PASSWORD);
    await gate.getByRole("button", { name: "Sign up free" }).click();

    await expect(gate).toBeHidden();
    expect(page.url()).toBe(results);
    await expect(page.getByText(/^\d+h left$/)).toHaveCount(0);

    await page.getByRole("button", { name: "Career", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Career Path" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("link", { name: RED_FLAG_COMPANY })).toBeVisible();
  });
});
