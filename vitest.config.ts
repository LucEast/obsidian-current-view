import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["__tests__/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    typecheck: {
      tsconfig: "./tsconfig.vitest.json",
    },
  },
});
