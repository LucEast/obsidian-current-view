import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
      "./view-mode": path.resolve(__dirname, "view-mode.ts"),
      "./main": path.resolve(__dirname, "src/main.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
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
