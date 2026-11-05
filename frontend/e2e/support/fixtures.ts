import { test as base, expect, type Browser, type Locator, type Page, type Route } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { CORPUS } from "../../../backend/eval/corpus";

export { expect };

export const API = "http://localhost:8100/api/v1";
export const WEB = "http://localhost:8180";
export const PASSWORD = "e2e-password-1";

export const letter = (id: string) => CORPUS.find((c) => c.id === id)!.text;
export const RED_FLAG_LETTER = "05-red-flag-heavy";
export const CLEAN_LETTER = "01-indian-product-clean";
/** Companies the mock reads out of the two letters above. */
export const RED_FLAG_COMPANY = "Vireo Systems Pvt Ltd";
export const CLEAN_COMPANY = "Zenthara Technologies Private Limited";

let emailCounter = 0;
export const uniqueEmail = () => `e2e-${Date.now()}-${emailCounter++}@example.com`;
export const unique = (label: string) => `${label} ${Date.now()}-${emailCounter++}`;

/**
 * Clears the limiter buckets in the suite's own Redis. Signup is 5/hour per IP, which a suite this
 * size passes in seconds; the limit itself is exercised by its own test.
 */
export function flushRateLimits() {
  execFileSync("docker", [
    "exec",
    "offerlens-e2e-redis",
    "sh",
    "-c",
    "for p in 'fastify-rate-limit-*' 'login-email:*' 'login-ip:*'; do redis-cli --scan --pattern \"$p\" | xargs -r redis-cli DEL >/dev/null; done",
  ]);
}

export interface Account {
  email: string;
  accessToken: string;
  refreshToken: string;
}

/** Creates an account through the API and puts its session in this page's localStorage. */
export async function signInNewAccount(page: Page): Promise<Account> {
  flushRateLimits();
  const email = uniqueEmail();
  const res = await page.request.post(`${API}/auth/signup`, { data: { email, password: PASSWORD } });
  expect(res.ok(), `signup failed: ${res.status()}`).toBe(true);
  const { accessToken, refreshToken } = (await res.json()).data.tokens;
  await setSession(page, accessToken, refreshToken);
  return { email, accessToken, refreshToken };
}

export async function setSession(page: Page, accessToken: string, refreshToken: string) {
  // robots.txt: same origin as the app, without booting the app and its auth check.
  await page.goto("/robots.txt");
  await page.evaluate(
    ([a, r]) => {
      localStorage.setItem("access_token", a);
      localStorage.setItem("refresh_token", r);
    },
    [accessToken, refreshToken],
  );
}

/** Setup shortcut for tests about what comes after an analysis. Upload itself has its own spec. */
export async function seedOffer(page: Page, letterId: string, account?: Account): Promise<string> {
  const headers = account ? { authorization: `Bearer ${account.accessToken}` } : undefined;
  const created = await page.request.post(`${API}/offers`, {
    headers,
    multipart: { text: letter(letterId), role: "Software Engineer", city: "Bangalore", experienceLevel: "Senior (5-8 yrs)" },
  });
  expect(created.status(), `seed failed: ${await created.text()}`).toBe(201);
  const id: string = (await created.json()).data.id;

  await expect
    .poll(
      async () => (await (await page.request.get(`${API}/offers/${id}`, { headers })).json()).data?.status,
      { timeout: 30_000, intervals: [250] },
    )
    .toBe("COMPLETED");
  return id;
}

/** Drives the real form up to and including the submit click. */
export async function fillPasteForm(page: Page, text: string) {
  await page.getByRole("tab", { name: "Paste Text" }).click();
  await page.getByPlaceholder(/Paste the text/).fill(text);
  await page.getByLabel("Role / Title").fill("Software Engineer");
  await page.getByLabel("City").fill("Bangalore");
  await chooseExperience(page);
}

export async function chooseExperience(page: Page) {
  await page.getByRole("combobox", { name: "Experience Level" }).click();
  await page.getByRole("option").first().click();
}

export async function analyseViaUi(page: Page, letterId: string) {
  await page.goto("/upload");
  await fillPasteForm(page, letter(letterId));
  await page.getByRole("button", { name: "Analyze My Offer" }).click();
  await page.waitForURL(/\/offers\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Red Flags" })).toBeVisible();
}

// No outside services in the suite. An empty script still "loads", so nothing waits on it.
const GOOGLE_SCRIPT = "https://accounts.google.com/**";
const emptyGoogleScript = (route: Route) => route.fulfill({ contentType: "text/javascript", body: "" });

/** A second, unrelated browser: its own cookies and localStorage. */
export const otherBrowser = async (browser: Browser) => {
  const context = await browser.newContext({ baseURL: WEB });
  await context.route(GOOGLE_SCRIPT, emptyGoogleScript);
  return { context, page: await context.newPage() };
};

export const toast = (page: Page, title: string): Locator =>
  page.getByRole("status").filter({ hasText: title }).first();

/** route.fulfill bypasses the API, so it has to supply the CORS headers the API would have. */
export const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" },
    body: JSON.stringify(body),
  });

export const apiError = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, details },
});

// Guide §0: these are expected. Everything else in the console fails the test.
const ALWAYS_EXPECTED = [/status of 40[14] /];

export const test = base.extend<{
  /** Fails the test on an unexpected console error or uncaught exception, as guide §0 asks. */
  expectedConsole: { allow: (pattern: RegExp) => void };
}>({
  expectedConsole: [
    async ({ page }, use) => {
      const seen: string[] = [];
      const allowed = [...ALWAYS_EXPECTED];
      page.on("console", (m) => {
        if (m.type() === "error") seen.push(m.text());
      });
      page.on("pageerror", (e) => seen.push(`uncaught: ${e.message}`));
      await page.route(GOOGLE_SCRIPT, emptyGoogleScript);

      await use({ allow: (pattern) => allowed.push(pattern) });

      expect(seen.filter((text) => !allowed.some((p) => p.test(text)))).toEqual([]);
    },
    { auto: true },
  ],
});

/** A one-page PDF with a real text layer, so the browser-side extractor reads it without OCR. */
export function textPdf(text: string): Buffer {
  const lines = text.split("\n").filter(Boolean);
  const stream = `BT /F1 10 Tf 40 800 Td 12 TL ${lines
    .map((l) => `(${l.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "")}) Tj T*`)
    .join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** A 1x1 PNG: enough for the upload path, which always sends images to OCR. */
export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Drops a synthetic file, which is the only way to reach the drop handler's own validation. */
export async function dropFile(page: Page, target: Locator, file: { name: string; type: string; size: number }) {
  const dataTransfer = await page.evaluateHandle(({ name, type, size }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(size)], name, { type }));
    return dt;
  }, file);
  await target.dispatchEvent("drop", { dataTransfer });
}
