import { defineConfig, devices } from "@playwright/test";

// Read-only checks of the deployed site. See e2e/live.spec.ts.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "live.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "https://offerlens.mueens.tech",
    trace: "retain-on-failure",
  },
});
