import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist` is build output. `src/components/ui` is generated shadcn/ui primitives —
  // linting vendored code produces noise nobody will act on, and edits there get
  // overwritten the next time a component is regenerated.
  { ignores: ["dist", "src/components/ui/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",

      // Currently ~23 violations, almost all annotating API response shapes
      // (`(rf: any)`, `(err: any)`). Those become genuinely typeable once Phase 1 adds
      // Zod schemas on the backend that the frontend can share — tightening this first
      // would only produce a wave of suppressions that hide the real work. Matches the
      // same decision recorded in backend/eslint.config.js.
      // TODO(Phase 1): raise to "error" once shared response types exist.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Config files legitimately use CommonJS interop (e.g. tailwind plugins).
    files: ["*.config.{ts,js}", "tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
