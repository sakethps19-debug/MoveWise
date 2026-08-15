import { defineConfig } from "vitest/config";

// Unit tests only (lib/**/*.test.ts) — e2e/ is a separate Playwright
// suite (pnpm test:e2e) and must stay excluded here, or vitest tries to
// run Playwright spec files as its own tests and fails immediately.
export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
