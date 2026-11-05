import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// ponytail: the smoke spec makes one signup per run, keyed per IP (a fresh browser context mints a
// new guest cookie, so the request falls back to the `ip:` bucket). authSignup is 5/hour per IP, so
// the 6th run within an hour from one machine gets a 429 and the signup never reaches /dashboard.
// Clearing the limiter buckets before the run makes the spec idempotent WITHOUT weakening the real
// limit. This is the same cleanup docs/LOCAL_DEVELOPMENT.md §8 documents by hand. If the Redis
// container is named something else, or the stack is remote, set E2E_SKIP_REDIS_FLUSH=1 and clear
// the keys yourself (scan `fastify-rate-limit-*` and `login-email:*`).
export default async function globalSetup() {
  if (process.env.E2E_SKIP_REDIS_FLUSH === "1") return;

  const container = process.env.E2E_REDIS_CONTAINER ?? "offerlens-redis";
  const patterns = ["fastify-rate-limit-*", "login-email:*"];

  for (const pattern of patterns) {
    try {
      // redis-cli has no bulk delete; pipe a --scan into DEL. Nothing matching is a no-op.
      const { stdout } = await run("docker", [
        "exec",
        container,
        "sh",
        "-c",
        `redis-cli --scan --pattern '${pattern}' | xargs -r redis-cli DEL`,
      ]);
      if (stdout.trim()) console.log(`[e2e] cleared ${pattern}: ${stdout.trim()}`);
    } catch (err) {
      // Not fatal: the run can still pass on a cold bucket. Warn so a 429 failure is explicable.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[e2e] could not flush rate-limit keys for '${pattern}' via 'docker exec ${container}'. ` +
          `If signup fails with 429, clear them manually (docs/LOCAL_DEVELOPMENT.md §8) or set ` +
          `E2E_SKIP_REDIS_FLUSH=1. Cause: ${message}`,
      );
    }
  }
}
