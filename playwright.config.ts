/**
 * @file playwright.config.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Настраивает браузерные проверки без запуска исполнителей рабочих очередей.
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import "dotenv/config";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 3 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: externalBaseURL || "http://localhost:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev:web",
        env: { REALIZE_AI_RUNTIME_ISOLATED: "true" },
        reuseExistingServer: true,
        url: "http://localhost:3000/api/health/live",
      },
});
