import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Never collect copied audit workspaces, generated reports or deployment artifacts.
    include: ["tests/**/*.test.ts"],
  },
});
