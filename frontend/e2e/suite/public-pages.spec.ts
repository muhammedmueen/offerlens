import type { Page } from "@playwright/test";
import { test, expect, flushRateLimits, otherBrowser, signInNewAccount, toast, unique } from "../support/fixtures";

// Guide §10 and §11. The E2E database is shared by the whole run, so every assertion is about a
// title this test created. Empty states are only true on a fresh database and are left to vitest.

test.describe("salary explorer", () => {
  const search = async (page: Page, role: string, city: string) => {
    await page.getByPlaceholder("Role (e.g. Software Engineer)").fill(role);
    await page.getByPlaceholder("City (e.g. Bangalore)").fill(city);
  };

  test("§10 nothing loads until a search, and 2+ characters are needed", async ({ page }) => {
    let lookups = 0;
    page.on("request", (r) => {
      if (r.url().includes("/salaries/stats")) lookups += 1;
    });
    await page.goto("/salaries");
    await expect(page.getByRole("heading", { name: "Salary Explorer" })).toBeVisible();
    await search(page, "S", "B");
    await expect(page.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(lookups).toBe(0);
  });

  test("§10 a hit shows the chart and labels the numbers as modelled", async ({ page }) => {
    await page.goto("/salaries");
    await search(page, "Software Engineer", "Bangalore");
    await page.getByRole("button", { name: "Search" }).click();

    const source = page.getByRole("complementary", { name: "Salary benchmark source" });
    await expect(source).toContainText("Modelled");
    await expect(source).toContainText("Public survey, adjusted for");
    await expect(source).toContainText(/n = \d+ respondents/);
    await expect(page.getByText(/^Fewer than 10 city-level submissions so far\./)).toBeVisible();
    await expect(page.locator(".recharts-wrapper")).toBeVisible();
  });

  test("§10 Enter searches, and a miss offers to contribute", async ({ page }) => {
    await page.goto("/salaries");
    await search(page, "Qqqzzz Nonexistent Role", "Bangalore");
    await page.keyboard.press("Enter");

    await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
    await page.getByRole("button", { name: "Contribute yours" }).click();
    await expect(page.getByRole("dialog", { name: "Submit salary data" })).toBeVisible();
  });

  // The dialog is about 890px tall (948px on a phone), so it has to scroll on anything shorter.
  const expectWholeDialogReachable = async (page: Page) => {
    await page.goto("/salaries");
    await page.getByRole("button", { name: "Submit Your Salary" }).click();
    const dialog = page.getByRole("dialog", { name: "Submit salary data" });
    const send = dialog.getByRole("button", { name: "Send data point" });
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport({ ratio: 1 });
    const heading = dialog.getByRole("heading", { name: "Submit salary data" });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport({ ratio: 1 });
  };

  test.describe("on a laptop screen", () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test("§10 the whole contribute dialog can be reached", async ({ page }) => {
      await expectWholeDialogReachable(page);
    });
  });

  test("§10 the whole contribute dialog can be reached on a phone @mobile", async ({ page }) => {
    await expectWholeDialogReachable(page);
  });

  test("§10 contributing validates, sends once, then holds off for an hour", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 429 /);
    await page.goto("/salaries");
    const dialog = page.getByRole("dialog", { name: "Submit salary data" });
    const fill = async (ctc: string) => {
      await page.getByRole("button", { name: "Submit Your Salary" }).click();
      await dialog.getByLabel("Job title").fill("Software Engineer");
      await dialog.getByLabel("City").fill("Bangalore");
      await dialog.getByLabel("Years of experience").fill("6");
      await dialog.getByLabel("Yearly CTC (₹)").fill(ctc);
      await dialog.getByRole("radio").first().check();
      await dialog.getByRole("combobox", { name: "Company type" }).click();
      await page.getByRole("option").first().click();
    };
    const send = () => dialog.getByRole("button", { name: "Send data point" }).click();

    await fill("not-a-number");
    await send();
    await expect(dialog.getByText("Enter digits only, for example 2400000")).toBeVisible();

    await dialog.getByLabel("Yearly CTC (₹)").fill("2400000");
    await send();
    await expect(toast(page, "Submitted")).toBeVisible();
    await expect(dialog).toBeHidden();

    await fill("2400000");
    await send();
    await expect(dialog).toContainText("You already shared a data point from this browser in the last hour.");
  });
});

test.describe("forum", () => {
  async function createPost(page: Page, category = "career") {
    const title = unique("E2E forum post");
    await page.goto("/forum");
    await page.getByRole("button", { name: "New Post" }).click();
    const dialog = page.getByRole("dialog", { name: "New Post" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: category }).click();
    await dialog.getByLabel("Body").fill("<img src=x onerror=\"window.__xss=1\"> Is this bond clause normal?");
    await dialog.getByRole("button", { name: "Post", exact: true }).click();
    await expect(toast(page, "Post created!")).toBeVisible();
    return title;
  }

  test("§11a a guest is gated from posting", async ({ page }) => {
    await page.goto("/forum");
    await page.getByRole("button", { name: "New Post" }).click();
    await expect(page.getByRole("dialog", { name: "Create a Free Account" })).toContainText("Forum posting");
  });

  test("§11a a member posts, it lists, and user text stays text", async ({ page }) => {
    await signInNewAccount(page);
    const title = await createPost(page);

    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(/\/forum\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('<img src=x onerror="window.__xss=1">', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.getByRole("heading", { name: "Comments (0)" })).toBeVisible();
  });

  test("§11a a member comments", async ({ page }) => {
    await signInNewAccount(page);
    const title = await createPost(page);
    await page.getByRole("link", { name: new RegExp(title) }).click();

    await page.getByPlaceholder("Write a comment…").fill("Ask them to cap it at six months.");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(toast(page, "Comment added!")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comments (1)" })).toBeVisible();
    await expect(page.getByText("Ask them to cap it at six months.")).toBeVisible();
  });

  test("§11a category filters narrow the list", async ({ page }) => {
    await signInNewAccount(page);
    const title = await createPost(page, "advice");
    const filters = page.getByRole("group", { name: "Filter by category" });
    const post = page.getByRole("link", { name: new RegExp(title) });
    await expect(post).toBeVisible();

    await filters.getByRole("button", { name: "negotiation" }).click();
    await expect(post).toHaveCount(0);
    await filters.getByRole("button", { name: "advice" }).click();
    await expect(post).toBeVisible();
    await filters.getByRole("button", { name: "All" }).click();
    await expect(post).toBeVisible();
  });

  test("§11a a guest's 'Log in' link comes back to the post", async ({ page, browser }) => {
    const account = await signInNewAccount(page);
    const title = await createPost(page);
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(/\/forum\/[^/]+$/);
    const postUrl = page.url();

    const guest = await otherBrowser(browser);
    await guest.page.goto(postUrl);
    await guest.page.locator("main, body").getByRole("link", { name: "Log in" }).click();
    await expect(guest.page).toHaveURL(/\/login\?returnUrl=%2Fforum%2F/);
    await guest.page.getByLabel("Email").fill(account.email);
    await guest.page.getByLabel("Password").fill("e2e-password-1");
    await guest.page.locator("form").getByRole("button", { name: "Log in" }).click();
    await expect(guest.page).toHaveURL(postUrl);
    await guest.context.close();
  });
});

test.describe("feature requests", () => {
  async function submitRequest(page: Page) {
    flushRateLimits();
    const title = unique("E2E request");
    await page.goto("/feature-requests");
    await page.getByRole("button", { name: "Submit Request" }).click();
    const dialog = page.getByRole("dialog", { name: "Submit Feature Request" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("A description that is long enough to pass.");
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(toast(page, "Request submitted!")).toBeVisible();
    return title;
  }

  const voteButton = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`${title}, \\d+ votes`) });

  test("§11b a guest can submit, once the hints are met", async ({ page }) => {
    await page.goto("/feature-requests");
    await page.getByRole("button", { name: "Submit Request" }).click();
    const dialog = page.getByRole("dialog", { name: "Submit Feature Request" });
    const submit = dialog.getByRole("button", { name: "Submit", exact: true });

    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Title").fill("Abcd");
    await dialog.getByLabel("Description").fill("Long enough description here.");
    await expect(dialog.getByText("At least 5 characters (4/200)")).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Title").fill("Abcde");
    await expect(submit).toBeEnabled();
    await page.keyboard.press("Escape");

    const title = await submitRequest(page);
    await expect(page.getByText(title)).toBeVisible();
  });

  test("§11b a vote counts once and disables the button", async ({ page }) => {
    const title = await submitRequest(page);
    const vote = voteButton(page, title);
    await expect(vote).toHaveAccessibleName(new RegExp(`Vote for ${title}, 0 votes`));
    await vote.click();
    await expect(page.getByRole("button", { name: `Voted for ${title}, 1 votes` })).toBeDisabled();
  });

  test("§11b the server refuses a second vote from another tab", async ({ page, context }) => {
    const title = await submitRequest(page);
    const other = await context.newPage();
    await other.goto("/feature-requests");
    await expect(voteButton(other, title)).toBeEnabled();

    await voteButton(page, title).click();
    await expect(page.getByRole("button", { name: `Voted for ${title}, 1 votes` })).toBeVisible();

    await voteButton(other, title).click();
    await expect(toast(other, "Already voted")).toBeVisible();
  });

  test("§11b sort and status filters", async ({ page }) => {
    const title = await submitRequest(page);
    await page.getByRole("button", { name: "Newest" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText(title)).toBeVisible();
  });
});
