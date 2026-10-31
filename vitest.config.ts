import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The repo tsconfig uses `jsx: preserve` (Next.js transforms JSX itself),
  // which leaves raw JSX for Vite to choke on when a test imports a .tsx
  // component (Hermes report: tracking-pixels suite failed to parse).
  // Transform JSX here — test pipeline only, Next build untouched.
  esbuild: { jsx: "automatic" },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
