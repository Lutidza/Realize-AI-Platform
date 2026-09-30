/**
 * @file tests/e2e/support/searchAcceptance.config.ts
 * @version 1.0.0
 * @date 2026-09-29
 * @description Запускает обязательную browser приёмку только на экземпляре приложения, созданном runner-ом.
 */
import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.SEARCH_ACCEPTANCE_BROWSER_URL;
const artifacts = process.env.SEARCH_ACCEPTANCE_ARTIFACTS;
if (
  !baseURL ||
  !artifacts ||
  process.env.SEARCH_ACCEPTANCE_BROWSER !== "true" ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)
)
  throw new Error("Run npm run check:search to create browser fixtures.");

export default defineConfig({
  testDir: resolve("tests/e2e"),
  testMatch: "search-observability.e2e.spec.ts",
  outputDir: resolve(artifacts, "browser"),
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 20000 },
  reporter: [
    ["json", { outputFile: resolve(artifacts, "reports/browser.json") }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 20000,
    navigationTimeout: 30000,
    // Auth запросы и секреты fixture не должны попадать в trace/видео.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
});
