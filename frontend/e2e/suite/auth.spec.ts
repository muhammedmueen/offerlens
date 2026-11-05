import type { Page } from "@playwright/test";
import { test, expect, flushRateLimits, PASSWORD, signInNewAccount, uniqueEmail, WEB } from "../support/fixtures";

// Guide §7 and the dead-session half of §12, plus session cases the guide does not list.

// .first(): during the 0.3s crossfade the outgoing page's navbar is still in the DOM.
const navLogIn = (page: Page) => page.getByRole("navigation").getByRole("button", { name: "Log in" }).first();
const navDashboard = (page: Page) => page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).first();
const submitLogin = (page: Page) => page.locator("form").getByRole("button", { name: "Log in" });

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submitLogin(page).click();
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

test.describe("signup", () => {
  test("§7a creates an account and lands on the dashboard", async ({ page }) => {
    flushRateLimits();
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up free" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(navDashboard(page)).toBeVisible();
  });

  test("§7a the browser blocks a bad email and a short password", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    await page.goto("/signup");
    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");

    await email.fill("not-an-email");
    await password.fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up free" }).click();
    expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

    await email.fill(uniqueEmail());
    await password.fill("short");
    await page.getByRole("button", { name: "Sign up free" }).click();
    expect(await password.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

    await expect(page).toHaveURL(/\/signup$/);
    expect(posts).toEqual([]);
  });

  test("§7a a duplicate email fails cleanly", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of (400|409) /);
    const { email } = await signInNewAccount(page);
    await page.evaluate(() => localStorage.clear());

    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up free" }).click();
    await expect(page.getByText("Signup failed. Please try again.")).toBeVisible();
  });
});

test.describe("Google sign-in", () => {
  test("§7b both buttons are hidden when the build has no client id", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Login with Google" })).toHaveCount(0);

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up with Google" })).toHaveCount(0);
  });

  // The stub throws as the real script does when it is handed an empty client id.
  test("a build with no client id survives Google's script loading", async ({ page }) => {
    await page.route("https://accounts.google.com/gsi/client", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `window.google = { accounts: { oauth2: { initTokenClient(c) {
          if (!c.client_id) throw new Error("Missing required parameter client_id.");
          return { requestAccessToken() {} };
        } } } };`,
      }),
    );
    for (const [path, heading] of [
      ["/login", "Welcome back"],
      ["/signup", "Create your account"],
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByText("This page failed to load.")).toHaveCount(0);
    }
  });
});

test.describe("login and logout", () => {
  test("§7c logs out to the home page and back in to the dashboard", async ({ page }) => {
    const { email } = await signInNewAccount(page);
    await page.goto("/dashboard");
    await logOut(page);
    await expect(page).toHaveURL(`${WEB}/`);
    await expect(navLogIn(page)).toBeVisible();

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("§7c a hard refresh keeps the session, with no bounce to login", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const visited: string[] = [];
    page.on("framenavigated", (f) => visited.push(f.url()));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(visited.filter((u) => u.includes("/login"))).toEqual([]);
  });

  test("§7c a wrong password says so", async ({ page }) => {
    const { email } = await signInNewAccount(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await logIn(page, email, "wrong-password-1");
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("§7c repeated wrong passwords hit the limiter, not a 500", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 429 /);
    const { email } = await signInNewAccount(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-1");
    const limited = page.getByText("Too many attempts. Please wait a while before trying again.");
    for (let attempt = 0; attempt < 12 && !(await limited.isVisible()); attempt++) {
      const answered = page.waitForResponse((r) => r.url().endsWith("/auth/login"));
      await submitLogin(page).click();
      expect((await answered).status()).toBeLessThan(500);
    }
    await expect(limited).toBeVisible();
    flushRateLimits();
  });

  test("gap: Back after logout does not show the dashboard", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await logOut(page);
    await expect(page).toHaveURL(`${WEB}/`);

    await page.goBack();
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
  });
});

test.describe("returnUrl", () => {
  for (const hostile of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "javascript:alert(document.domain)"]) {
    test(`gap: logging in goes to the dashboard for returnUrl=${hostile}`, async ({ page }) => {
      const dialogs: string[] = [];
      page.on("dialog", (d) => {
        dialogs.push(d.message());
        void d.dismiss();
      });
      const left: string[] = [];
      await page.route((url) => url.hostname === "evil.example", (route) => {
        left.push(route.request().url());
        return route.abort();
      });

      const { email } = await signInNewAccount(page);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`/login?returnUrl=${encodeURIComponent(hostile)}`);
      await logIn(page, email);

      await expect(page).toHaveURL(`${WEB}/dashboard`);
      expect(left).toEqual([]);
      expect(dialogs).toEqual([]);
    });
  }
});

test.describe("already signed in", () => {
  test("gap: /login and /signup go to the dashboard", async ({ page }) => {
    await signInNewAccount(page);
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`${WEB}/dashboard`);
    }
  });

  test("gap: /login honours a returnUrl", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/login?returnUrl=%2Fforum");
    await expect(page).toHaveURL(`${WEB}/forum`);
  });

  test("gap: a dead session on /login does not loop", async ({ page, expectedConsole }) => {
    // The session check is retried as a guest, and /users/me answers a guest with 403 by design.
    expectedConsole.allow(/status of 403 /);
    await signInNewAccount(page);
    await page.evaluate(() => {
      localStorage.removeItem("refresh_token");
      localStorage.setItem("access_token", "dead.jwt.value");
    });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBeNull();
  });
});

test.describe("session health", () => {
  test("gap: an expired access token refreshes silently", async ({ page }) => {
    await signInNewAccount(page);
    await page.evaluate(() => localStorage.setItem("access_token", "expired.jwt.value"));

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Offer History")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("access_token")))
      .not.toBe("expired.jwt.value");
  });

  const killSession = (page: Page) =>
    page.evaluate(() => {
      localStorage.removeItem("refresh_token");
      localStorage.setItem("access_token", "dead.jwt.value");
    });

  test("§12 a dead session on a protected page goes to login", async ({ page }) => {
    await signInNewAccount(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await killSession(page);

    await page.reload();
    await expect(page).toHaveURL(/\/login\?returnUrl=/);
  });

  test("§12 a dead session on a public page visibly becomes a guest", async ({ page, expectedConsole }) => {
    // The session check is retried as a guest, and /users/me answers a guest with 403 by design.
    expectedConsole.allow(/status of 403 /);
    await signInNewAccount(page);
    await page.goto("/salaries");
    await expect(navDashboard(page)).toBeVisible();
    await killSession(page);

    await page.goto("/upload");
    await expect(navLogIn(page)).toBeVisible();
    await expect(navDashboard(page)).toHaveCount(0);
    await expect(page.getByText("1 of 1 analysis left today")).toBeVisible();
  });

  test("gap: logging out in one tab logs out the other", async ({ page, context }) => {
    await signInNewAccount(page);
    await page.goto("/salaries");
    const other = await context.newPage();
    await other.goto("/forum");
    await expect(navDashboard(other)).toBeVisible();

    await logOut(page);
    await expect(navLogIn(other)).toBeVisible();
  });

  test("gap: logging in in one tab logs in the other", async ({ page, context }) => {
    const { email } = await signInNewAccount(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    const other = await context.newPage();
    await other.goto("/forum");
    await expect(navLogIn(other)).toBeVisible();

    await logIn(page, email);
    await expect(navDashboard(other)).toBeVisible();
  });
});
