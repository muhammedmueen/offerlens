import {
  test,
  expect,
  API,
  apiError,
  chooseExperience,
  CLEAN_LETTER,
  dropFile,
  fillPasteForm,
  fulfillJson,
  letter,
  RED_FLAG_LETTER,
  seedOffer,
  signInNewAccount,
  textPdf,
  tinyPng,
  toast,
} from "../support/fixtures";

// Guide §5a and §5a-file.

const quotaBody = (feature: string) =>
  apiError("QUOTA_EXCEEDED", "Daily limit", {
    feature,
    limit: 3,
    used: 3,
    remaining: 0,
    resetAt: "2030-01-01T18:30:00.000Z",
    plan: "free",
  });

test.describe("paste text", () => {
  test("§5a the form appears past 20 characters and submit waits for every field", async ({ page }) => {
    await page.goto("/upload");
    await page.getByRole("tab", { name: "Paste Text" }).click();
    const form = page.getByRole("heading", { name: "Tell us about the role" });

    await page.getByPlaceholder(/Paste the text/).fill("twenty characters ok");
    await expect(form).toBeHidden();
    await page.getByPlaceholder(/Paste the text/).fill(letter(CLEAN_LETTER));
    await expect(form).toBeVisible();

    const submit = page.getByRole("button", { name: "Analyze My Offer" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Role / Title").fill("Software Engineer");
    await expect(submit).toBeDisabled();
    await page.getByLabel("City").fill("Bangalore");
    await expect(submit).toBeDisabled();
    await chooseExperience(page);
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page).toHaveURL(/\/offers\/[^/]+\/(processing)?/);
  });

  test("§5a typing a role or city offers suggestions that fill the field", async ({ page }) => {
    await page.goto("/upload");
    await page.getByRole("tab", { name: "Paste Text" }).click();
    await page.getByPlaceholder(/Paste the text/).fill(letter(CLEAN_LETTER));

    await page.getByLabel("City").fill("Ban");
    const suggestion = page.getByRole("button", { name: "Bangalore" });
    await suggestion.click();
    await expect(page.getByLabel("City")).toHaveValue("Bangalore");
    await expect(suggestion).toBeHidden();
  });

  test("§5a a member sees their own allowance, and it counts down", async ({ page }) => {
    const account = await signInNewAccount(page);
    await page.goto("/upload");
    await expect(page.getByText("3 of 3 analyses left today")).toBeVisible();

    await seedOffer(page, CLEAN_LETTER, account);
    await page.reload();
    await expect(page.getByText("2 of 3 analyses left today")).toBeVisible();
  });

  test("gap: a member out of analyses sees the limit and cannot submit", async ({ page }) => {
    const account = await signInNewAccount(page);
    await seedOffer(page, CLEAN_LETTER, account);
    await seedOffer(page, RED_FLAG_LETTER, account);
    await seedOffer(page, "02-service-company-bond", account);

    await page.goto("/upload");
    await expect(page.getByText(/^You've used all 3 analyses today\. They reset at .+ IST\.$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create free account" })).toHaveCount(0);

    await fillPasteForm(page, letter("03-startup-vague-equity"));
    await expect(page.getByRole("button", { name: "Analyze My Offer" })).toBeDisabled();
  });

  test("gap: re-submitting the same letter returns the same offer", async ({ page }) => {
    const account = await signInNewAccount(page);
    const first = await seedOffer(page, CLEAN_LETTER, account);
    const second = await seedOffer(page, CLEAN_LETTER, account);
    expect(second).toBe(first);
  });

  const submitErrors: Array<[string, number, unknown, string]> = [
    ["Daily limit reached", 429, quotaBody("analysis"), "Daily limit reached"],
    ["Slow down", 429, apiError("RATE_LIMIT_EXCEEDED", "Too many"), "Slow down"],
    ["Upload failed", 500, apiError("INTERNAL_ERROR", "Boom"), "Upload failed"],
  ];

  for (const [name, status, body, title] of submitErrors) {
    test(`§5a submit error shows "${name}" and stays on the form`, async ({ page, expectedConsole }) => {
      expectedConsole.allow(/status of (429|500) /);
      await page.route(`${API}/offers`, (route) =>
        route.request().method() === "POST" ? fulfillJson(route, status, body) : route.continue(),
      );
      await page.goto("/upload");
      await fillPasteForm(page, letter(CLEAN_LETTER));
      await page.getByRole("button", { name: "Analyze My Offer" }).click();

      await expect(toast(page, title)).toBeVisible();
      await expect(page).toHaveURL(/\/upload$/);
    });
  }

  test("§5a production builds have no model picker", async ({ page }) => {
    await page.goto("/upload");
    await page.getByRole("tab", { name: "Paste Text" }).click();
    await page.getByPlaceholder(/Paste the text/).fill(letter(CLEAN_LETTER));
    await expect(page.getByRole("heading", { name: "Tell us about the role" })).toBeVisible();
    await expect(page.getByText("AI Model (Development Only)")).toHaveCount(0);
  });
});

test.describe("file upload", () => {
  const dropZone = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: /Drop your offer letter here/ });
  const fileInput = (page: import("@playwright/test").Page) => page.locator('input[type="file"]');

  test("§5a-file a text PDF is read in the browser and autofills the form", async ({ page }) => {
    const ocrCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/offers/extract-file")) ocrCalls.push(r.url());
    });
    await page.goto("/upload");
    await fileInput(page).setInputFiles({
      name: "offer.pdf",
      mimeType: "application/pdf",
      buffer: textPdf(letter(CLEAN_LETTER)),
    });

    // Only one toast shows at a time, and "Text extracted" is replaced within milliseconds here.
    await expect(toast(page, "Data extracted")).toBeVisible();
    expect(ocrCalls).toEqual([]);
    await expect(page.getByLabel("Role / Title")).toHaveValue("Mock Software Engineer");
    await expect(page.getByLabel("City")).toHaveValue("Mock City");
    await expect(page.getByLabel("Current CTC (optional)")).toHaveValue("1500000");
  });

  test("§5a-file an image goes to OCR", async ({ page }) => {
    await page.goto("/upload");
    const ocr = page.waitForResponse((r) => r.url().endsWith("/offers/extract-file"));
    await fileInput(page).setInputFiles({ name: "offer.png", mimeType: "image/png", buffer: tinyPng });
    expect((await ocr).ok()).toBe(true);
    // The "Scanned document" and "OCR complete" toasts replace each other too fast to catch here.
    await expect(toast(page, "Data extracted")).toBeVisible();
    await expect(page.getByLabel("Role / Title")).toHaveValue("Mock Software Engineer");
  });

  test("§5a-file OCR being unavailable is explained, never a silent hang", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 503 /);
    await page.route(`${API}/offers/extract-file`, (route) =>
      fulfillJson(route, 503, apiError("OCR_UNAVAILABLE", "No OCR")),
    );
    await page.goto("/upload");
    await fileInput(page).setInputFiles({ name: "offer.png", mimeType: "image/png", buffer: tinyPng });

    await expect(page.getByRole("alert").filter({ hasText: "Image uploads aren't available here." })).toBeVisible();
    await expect(toast(page, "Image uploads unavailable")).toBeVisible();
  });

  test("§5a-file autofill running out says so and leaves the form usable", async ({ page, expectedConsole }) => {
    expectedConsole.allow(/status of 429 /);
    await page.route(`${API}/offers/extract`, (route) => fulfillJson(route, 429, quotaBody("autofill")));
    await page.goto("/upload");
    await fileInput(page).setInputFiles({
      name: "offer.pdf",
      mimeType: "application/pdf",
      buffer: textPdf(letter(CLEAN_LETTER)),
    });

    await expect(toast(page, "Autofill limit reached")).toBeVisible();
    await expect(page.getByLabel("Role / Title")).toHaveValue("");
  });

  test("§5a-file a dropped file of the wrong type is refused", async ({ page }) => {
    await page.goto("/upload");
    await dropFile(page, dropZone(page), {
      name: "offer.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 10,
    });
    await expect(page.getByRole("alert").filter({ hasText: "Please upload a PDF or image (JPG, PNG)" })).toBeVisible();
  });

  test("§5a-file a dropped PDF over 10 MB is refused", async ({ page }) => {
    await page.goto("/upload");
    await dropFile(page, dropZone(page), { name: "big.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 });
    await expect(page.getByRole("alert").filter({ hasText: "File must be under 10MB" })).toBeVisible();
  });

  test("§5a-file the drop zone is reachable and opens the picker from the keyboard", async ({ page }) => {
    await page.goto("/upload");
    await dropZone(page).focus();
    for (const key of ["Enter", " "]) {
      const chooser = page.waitForEvent("filechooser");
      await page.keyboard.press(key);
      await chooser;
    }
  });
});
