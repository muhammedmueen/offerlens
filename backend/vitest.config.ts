import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        // Colocated with source so `tsc --noEmit` typechecks them too.
        // (tsconfig only excludes **/__tests__/**, so *.test.ts under src/ is covered.)
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
