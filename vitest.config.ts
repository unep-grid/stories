import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "stories/*/src/**/*.test.ts"],
    environment: "node",
  },
});
