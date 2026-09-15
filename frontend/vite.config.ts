import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // The initial chunk was 1,465 KB against a 200 KB budget (ADR-002). Warn loudly if a
    // chunk creeps back over, rather than discovering it in a Lighthouse run.
    chunkSizeWarningLimit: 600,
  },
}));
