import { test, expect, CLEAN_LETTER, seedOffer, signInNewAccount } from "../support/fixtures";

// Guide §12, apart from FAILED (processing.spec) and dead sessions (auth.spec).

test.describe("bad links", () => {
  test("§12 an unknown URL gets the 404 page and a way home", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/404 Error: User attempted to access non-existent route:/);
    await page.goto("/does-not-exist");
    await expect(page.getByText("// 404")).toBeVisible();
    await expect(page.getByText("We couldn't find that page.")).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);

    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page.getByRole("heading", { name: "Is this offer actually good?" })).toBeVisible();
  });

  test("gap: an unknown offer id explains itself", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 400 /);
    await page.goto("/offers/00000000-0000-4000-8000-00000000abcd");
    await expect(page.getByRole("heading", { name: "This analysis isn't ready or isn't available" })).toBeVisible();
  });

  test("gap: an unknown forum post shows an error with a retry", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of (400|500) /);
    await page.goto("/forum/00000000-0000-4000-8000-00000000abcd");
    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("§4c a member's analysis is hidden from another member", async ({ page, context }) => {
    const owner = await signInNewAccount(page);
    const id = await seedOffer(page, CLEAN_LETTER, owner);
    await page.evaluate(() => localStorage.clear());
    await context.clearCookies();

    await signInNewAccount(page);
    await page.goto(`/offers/${id}`);
    await expect(page.getByRole("heading", { name: "This analysis isn't ready or isn't available" })).toBeVisible();
  });
});

test.describe("network failures", () => {
  test("§12 a route chunk failing offline falls to the boundary and recovers", async ({
    page,
    context,
    expectedConsole,
  }) => {
    expectedConsole.allow(/ErrorBoundary|ERR_INTERNET_DISCONNECTED|dynamically imported module/);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Is this offer actually good?" })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("contentinfo").getByRole("link", { name: "Salaries" }).click();
    await expect(page.getByText("This page failed to load.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    await context.setOffline(false);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Is this offer actually good?" })).toBeVisible();

    await page.goto("/salaries");
    await expect(page.getByRole("heading", { name: "Salary Explorer" })).toBeVisible();
  });

  test("§12 a network blip recovers without a reload", async ({ page, context, expectedConsole }) => {
    expectedConsole.allow(/ERR_INTERNET_DISCONNECTED/);
    await page.goto("/forum");
    await expect(page.getByRole("group", { name: "Filter by category" })).toBeVisible();

    // React Query pauses while offline instead of erroring, and resumes by itself on reconnect.
    await context.setOffline(true);
    await page.getByRole("button", { name: "negotiation" }).click();
    await expect(page.getByRole("button", { name: "negotiation" })).toHaveAttribute("aria-pressed", "true");

    const resumed = page.waitForResponse((r) => r.url().includes("category=negotiation"));
    await context.setOffline(false);
    expect((await resumed).ok()).toBe(true);
    await expect(page.getByText("No posts yet").or(page.getByRole("link", { name: /comments$/ }).first())).toBeVisible();
    await expect(page.getByText("Something went wrong. Please try again.")).toHaveCount(0);
  });
});
