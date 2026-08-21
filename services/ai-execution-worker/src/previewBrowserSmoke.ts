/**
 * @file services/ai-execution-worker/src/previewBrowserSmoke.ts
 * @owner services/ai-execution-worker
 * @purpose Verifies the actual loopback preview through an isolated Playwright browser.
 */

import { createHash } from "node:crypto";

import { chromium } from "@playwright/test";

import type { WorkerCheckResult } from "./types";

/** Opens readiness and storefront routes in the actual preview environment. */
export const runPreviewBrowserSmoke = async (
  previewURL: string,
): Promise<WorkerCheckResult> => {
  const started = new Date();
  let summary = "";
  let status: WorkerCheckResult["status"] = "failed";
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: previewURL });
    const page = await context.newPage();
    const readiness = await page.goto("/api/health/ready", {
      waitUntil: "domcontentloaded",
    });
    if (!readiness?.ok()) {
      throw new Error(
        `Readiness returned ${readiness?.status() || "no response"}.`,
      );
    }
    const storefront = await page.goto("/", {
      waitUntil: "networkidle",
    });
    if (!storefront?.ok()) {
      throw new Error(
        `Storefront returned ${storefront?.status() || "no response"}.`,
      );
    }
    const nextError = await page.locator("nextjs-portal").count();
    if (nextError > 0) throw new Error("Next.js error overlay is present.");
    const title = (await page.title()).trim();
    summary = `Preview readiness and storefront passed in Chromium; title=${title || "(empty)"}.`;
    status = "passed";
    await context.close();
  } catch (error) {
    summary =
      error instanceof Error ? error.message : "Preview browser smoke failed.";
  } finally {
    await browser.close();
  }
  const finished = new Date();
  return {
    command: "playwright preview smoke",
    durationMs: finished.getTime() - started.getTime(),
    evidenceHash: createHash("sha256")
      .update(JSON.stringify([previewURL, status, summary]))
      .digest("hex"),
    finishedAt: finished.toISOString(),
    outputSummary: summary.slice(0, 8_000),
    startedAt: started.toISOString(),
    status,
  };
};
