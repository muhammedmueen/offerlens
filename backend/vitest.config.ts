import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// src/config/index.ts calls process.exit(1) at import time unless these three are set, which
// crashes every test file that imports the app config (7 files in CI, where there is no .env).
// Fallback only: a value from the shell or from backend/.env (loaded above) always wins, so local
// runs and the Postgres-only quota test (QUOTA_PG_TEST + a real DATABASE_URL) behave as before.
// Dummy literals, not secrets. Nothing connects: the unit tests never open a database.
const testEnv = {
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/offerlens_unit_tests',
    JWT_SECRET: process.env.JWT_SECRET ?? 'unit-test-jwt-secret-not-a-real-secret-0000',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'unit-test-jwt-refresh-secret-not-real-0000',
};

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        // Colocated with source so `tsc --noEmit` typechecks them too.
        // (tsconfig only excludes **/__tests__/**, so *.test.ts under src/ is covered.)
        // `eval/` holds the extraction accuracy harness; its scorer is unit-tested here.
        include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
        environment: 'node',
        env: testEnv,
    },
});
