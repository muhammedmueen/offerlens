import { test, expect } from "@playwright/test";

// Read-only checks of the deployed site: page loads only. Nothing here may submit a form, sign up
// or start an analysis. Those create real records and spend real AI calls.

for (const [path, heading] of [
  ["/", "Is this offer actually good?"],
  ["/login", "Welcome back"],
  ["/signup", "Create your account"],
  ["/salaries", "Salary Explorer"],
  ["/forum", "Forum"],
  ["/feature-requests", "Feature Requests"],
] as const) {
  test(`${path} loads with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("guide §7b: both Google buttons show on live", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Login with Google" })).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Sign up with Google" })).toBeVisible();
});

test("guide §7b: protected pages still redirect", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
});
