import { defineConfig } from "@playwright/test";

// Real-AI smoke spec for the §8 walkthrough (`npm run test:e2e:real`). It needs the real stack already running (Postgres, Redis,
// API, workers, `npm run dev`) and a working AI key: see docs/LOCAL_DEVELOPMENT.md §6.
// ponytail: no `webServer` block. Booting the API and workers from here would hide the
// "forgot the workers" failure the walkthrough warns about.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "smoke.spec.ts",
  // Clears the live rate-limit buckets before the run so a repeated spec does not trip authSignup
  // (5/hour per IP). It never weakens the limit; see e2e/global-setup.real.ts.
  globalSetup: "./e2e/global-setup.real.ts",
  timeout: 5 * 60_000, // two real Gemini analyses plus two drawer calls
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
});
