// Boots everything the E2E suite needs: containers, schema and seed data, a production frontend
// build, the API, the workers and a static server. Playwright runs this as its webServer, and you
// can run it by hand (`npm run e2e:stack`) to keep the stack up between test runs.
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const backend = resolve(frontend, "../backend");
const outDir = "node_modules/.e2e-dist"; // never frontend/dist, which is what deploys ship
const API_PORT = "8100";
const WEB_PORT = "8180";

const backendEnv = {
  ...process.env,
  // Explicit values win over backend/.env (dotenv never overrides), so a real AI key there is unused.
  NODE_ENV: "development",
  PORT: API_PORT,
  CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5433/offerlens_e2e",
  REDIS_URL: "redis://localhost:6380",
  AI_PROVIDER: "mock",
  OCR_PROVIDER: "mock",
  GOOGLE_CLIENT_ID: "",
  STORAGE_PATH: join(tmpdir(), "offerlens-e2e-uploads"),
  LOG_LEVEL: "warn",
  JWT_SECRET: "e2e-jwt-secret-not-a-real-secret-000000000",
  JWT_REFRESH_SECRET: "e2e-jwt-refresh-secret-not-a-real-secret-0",
};
mkdirSync(backendEnv.STORAGE_PATH, { recursive: true });

const sh = (command, cwd, env = process.env) => {
  console.log(`[e2e] ${command}`);
  execSync(command, { cwd, env, stdio: "inherit" });
};

sh("docker compose -f e2e/docker-compose.yml up -d --wait", frontend);
sh("npm run db:migrate", backend, backendEnv);
sh("npm run db:seed", backend, backendEnv);
sh("npm run db:load-reference", backend, backendEnv);
sh("npm run db:load-city-factors", backend, backendEnv);
sh(`npx vite build --outDir ${outDir} --emptyOutDir`, frontend, {
  ...process.env,
  VITE_API_BASE_URL: `http://localhost:${API_PORT}/api/v1`,
  VITE_GOOGLE_CLIENT_ID: "",
});

const children = [];
// With shell: true, child.kill() on Windows ends the shell and orphans the server behind it, and a
// leftover web port would then be reused by the next run with no API behind it.
const stopAll = () => {
  for (const child of children) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      else child.kill();
    } catch {
      // Already gone.
    }
  }
};
const start = (name, command, cwd, env) => {
  const child = spawn(command, { cwd, env, shell: true, stdio: "inherit" });
  // A dead worker would otherwise surface as a pile of test timeouts.
  child.on("exit", (code) => {
    console.error(`[e2e] ${name} exited with code ${code}, stopping the stack`);
    stopAll();
    process.exit(1);
  });
  children.push(child);
};

start("api", "npx tsx src/server.ts", backend, backendEnv);
start("workers", "npx tsx src/workers/index.ts", backend, backendEnv);

// Playwright only watches the web port, so that has to open last.
const apiUrl = `http://localhost:${API_PORT}/api/v1/metadata/experience-levels`;
for (let up = false; !up; ) {
  up = await fetch(apiUrl).then((r) => r.ok, () => false);
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
start("web", `npx vite preview --outDir ${outDir} --port ${WEB_PORT} --strictPort`, frontend, process.env);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopAll();
    process.exit(0);
  });
}
