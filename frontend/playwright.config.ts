import { defineConfig, devices } from "@playwright/test";

const WEB_URL = "http://localhost:8180";

// The main E2E suite: the real stack with AI_PROVIDER=mock, booted by e2e/stack.mjs against its own
// containers. Real Gemini runs live in playwright.real.config.ts, live-site checks in
// playwright.live.config.ts.
export default defineConfig({
  testDir: "./e2e/suite",
  fullyParallel: false,
  // One worker: rate-limit tests would race the flush that the signup fixture does.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/stack.mjs",
    url: WEB_URL,
    timeout: 5 * 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
