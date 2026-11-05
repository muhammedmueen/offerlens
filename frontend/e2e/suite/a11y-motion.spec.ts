import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  API,
  CLEAN_LETTER,
  RED_FLAG_LETTER,
  seedOffer,
  signInNewAccount,
  unique,
} from "../support/fixtures";

// Guide §2 and §13: the parts a machine can judge. Whether motion feels calm, real contrast in
// context and screen-reader use stay with the manual guide.

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`);
}

test.describe("axe scan", () => {
  for (const path of ["/", "/upload", "/login", "/signup", "/salaries", "/forum", "/feature-requests"]) {
    test(`§13 ${path} has no serious violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(600); // let the entrance fade finish, or axe sees half-opaque text
      expect(await scan(page)).toEqual([]);
    });
  }

  test("§13 a forum post has no serious violations, as a guest", async ({ page }) => {
    const { accessToken } = await signInNewAccount(page);
    const created = await page.request.post(`${API}/forum/posts`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: { title: unique("E2E axe post"), content: "A post to scan.", category: "general" },
    });
    expect(created.ok()).toBe(true);
    const { id } = (await created.json()).data;
    await page.evaluate(() => localStorage.clear());

    await page.goto(`/forum/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    expect(await scan(page)).toEqual([]);
  });

  test("§13 the dashboard has no serious violations", async ({ page }) => {
    const account = await signInNewAccount(page);
    await seedOffer(page, CLEAN_LETTER, account);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Offer History" })).toBeVisible();
    await page.waitForTimeout(600);
    expect(await scan(page)).toEqual([]);
  });

  test("§13 the results page has no serious violations", async ({ page }) => {
    const account = await signInNewAccount(page);
    const id = await seedOffer(page, RED_FLAG_LETTER, account);
    await page.goto(`/offers/${id}`);
    await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(await scan(page)).toEqual([]);
  });
});

test.describe("structure and keyboard", () => {
  test("§13 every page has exactly one h1", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/404 Error: User attempted/);
    for (const path of ["/", "/upload", "/login", "/signup", "/salaries", "/forum", "/feature-requests", "/nope"]) {
      await page.goto(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
    }
  });

  test("§13 clicking an upload label focuses its input", async ({ page }) => {
    await page.goto("/upload");
    await page.getByRole("tab", { name: "Paste Text" }).click();
    await page.getByPlaceholder(/Paste the text/).fill("a letter long enough to show the form");

    await page.getByText("Role / Title *").click();
    await expect(page.getByPlaceholder("e.g. Software Engineer")).toBeFocused();
    await page.getByText("City *").click();
    await expect(page.getByPlaceholder("e.g. Bangalore")).toBeFocused();
  });

  test("§13 Tab reaches the navigation with a visible focus ring", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("aria-label", "OfferLens home");
    await expect(focused).toHaveJSProperty("tagName", "A");
    const ring = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, shadow: s.boxShadow };
    });
    expect(ring.outline !== "none" || ring.shadow !== "none").toBe(true);
  });

  test("§13 dialogs trap focus and close on Escape", async ({ page }) => {
    await page.goto("/feature-requests");
    await page.getByRole("button", { name: "Submit Request" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Submit Feature Request" });
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Submit Request" })).toBeFocused();
  });
});

test.describe("focus after a dialog opened from state", () => {
  test("§13 closing the sign-up gate hands focus back", async ({ page }) => {
    await page.goto("/forum");
    const newPost = page.getByRole("button", { name: "New Post" });
    await newPost.focus();
    await page.keyboard.press("Enter");
    const gate = page.getByRole("dialog", { name: "Create a Free Account" });
    await expect(gate).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(gate).toBeHidden();
    await expect(newPost).toBeFocused();
  });
});

test.describe("page transitions", () => {
  test("§2a a slow route holds the old page: no blank frame, no skeleton", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Is this offer actually good?" })).toBeVisible();

    // Widen the window a flicker would show in.
    await page.route(/assets\/SalaryExplorerPage-.*\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.evaluate(() => {
      const w = window as unknown as { __frames: { h1s: number; skeleton: boolean }[] };
      w.__frames = [];
      const sample = () => {
        w.__frames.push({
          h1s: document.querySelectorAll("h1").length,
          skeleton: !!document.querySelector(".animate-pulse"),
        });
        requestAnimationFrame(sample);
      };
      sample();
    });

    await page.getByRole("contentinfo").getByRole("link", { name: "Salaries" }).click();
    await expect(page.getByRole("heading", { name: "Salary Explorer" })).toBeVisible();

    const frames = await page.evaluate(
      () => (window as unknown as { __frames: { h1s: number; skeleton: boolean }[] }).__frames,
    );
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.filter((f) => f.h1s === 0)).toEqual([]);
    expect(frames.filter((f) => f.skeleton)).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("§2c the landing hero does not rise", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __transforms: string[] };
      w.__transforms = [];
      const sample = () => {
        const h1 = document.querySelector("h1");
        for (let el: Element | null = h1; el && el !== document.body; el = el.parentElement) {
          const t = getComputedStyle(el).transform;
          if (t !== "none") w.__transforms.push(t);
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);

    const transforms = await page.evaluate(() => (window as unknown as { __transforms: string[] }).__transforms);
    expect(transforms).toEqual([]);
  });

  test("§2c content is never stuck invisible", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "See what your letter really says" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "See what your letter really says" })).toHaveCSS("opacity", "1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  // KNOWN DEFECT listed in guide §2c: MotionCard ignores reduced motion. Delete test.fail() once it
  // checks useReducedMotion, and the guide's note with it.
  test("§2c dashboard cards do not lift on hover", async ({ page }) => {
    test.fail();
    await signInNewAccount(page);
    await page.goto("/dashboard");
    const card = page.getByText("Total Offers").locator("../..");
    await expect(card).toBeVisible();
    await page.waitForTimeout(800);

    await card.hover();
    await page.waitForTimeout(400);
    expect(await card.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });
});
