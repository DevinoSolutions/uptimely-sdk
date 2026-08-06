import { defineConfig } from "vitest/config";

// Package-local config: without it vitest walks up to the ROOT config, whose
// testcontainer global-setup (packages/db) this pure-unit suite neither needs
// nor can resolve from here.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
