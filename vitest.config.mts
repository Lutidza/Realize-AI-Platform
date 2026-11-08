/**
 * @file vitest.config.mts
 * @version 1.0.0
 * @date 2026-11-06
 * @description Настраивает integration tests платформы и ограничивает число параллельных процессов.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    maxWorkers: 4,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/int/**/*.int.spec.ts"],
  },
});
