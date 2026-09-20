/**
 * @file services/ai-execution-worker/src/previewBrowserSmoke.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет readiness и точную страницу изолированного предпросмотра через Chromium.
 */

import { createHash } from "node:crypto";

import { chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";

import type { WorkerCheckResult } from "./types";

/** Проверяет только loopback URL, сохраняя ошибки запуска браузера и навигации в evidence. */
export const runPreviewBrowserSmoke = async (
  previewURL: string,
): Promise<WorkerCheckResult> => {
  const started = new Date();
  let summary = "";
  let status: WorkerCheckResult["status"] = "failed";
  let browser: Browser | undefined;
  let blockedNavigation: string | undefined;
  try {
    const target = new URL(previewURL);
    if (
      target.protocol !== "http:" ||
      target.hostname !== "127.0.0.1" ||
      Number(target.port) < 1024 ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      (previewURL !== target.href && previewURL !== target.origin) ||
      (target.pathname !== "/" &&
        !/^\/reference(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/.test(target.pathname))
    ) {
      throw new Error(
        "Preview smoke requires a canonical loopback root or static reference URL.",
      );
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      baseURL: target.origin,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const readinessURL = `${target.origin}/api/health/ready`;
    const allowedNavigation = new Set([readinessURL, target.href]);
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        !request.isNavigationRequest() ||
        request.frame() !== page.mainFrame()
      ) {
        await route.continue();
        return;
      }
      if (!allowedNavigation.has(request.url())) {
        blockedNavigation =
          "Preview navigation redirected away from the approved target.";
        await route.abort();
        return;
      }
      try {
        // page.route не вызывается для последующих HTTP redirects; не следуем им при чтении ответа.
        const response = await route.fetch({ maxRedirects: 0 });
        if (response.status() >= 300 && response.status() < 400) {
          blockedNavigation = `Preview navigation returned redirect ${response.status()}.`;
          await route.abort();
          return;
        }
        await route.fulfill({ response });
      } catch (error) {
        blockedNavigation =
          error instanceof Error ? error.message : "Preview navigation failed.";
        await route.abort().catch(() => undefined);
      }
    });
    const readiness = await page.goto(readinessURL, {
      waitUntil: "domcontentloaded",
    });
    if (!readiness?.ok()) {
      throw new Error(
        `Readiness returned ${readiness?.status() || "no response"}.`,
      );
    }
    if (page.url() !== readinessURL) {
      throw new Error(
        "Preview readiness redirected away from its health endpoint.",
      );
    }
    const targetResponse = await page.goto(target.href, {
      waitUntil: "networkidle",
    });
    if (!targetResponse?.ok()) {
      throw new Error(
        `Preview target ${target.pathname} returned ${targetResponse?.status() || "no response"}.`,
      );
    }
    if (blockedNavigation || page.url() !== target.href) {
      throw new Error(
        blockedNavigation || "Preview target redirected to another page.",
      );
    }
    const nextError = await page.locator("nextjs-portal").count();
    if (nextError > 0) throw new Error("Next.js error overlay is present.");
    const title = (await page.title()).trim();
    summary = `Preview readiness and target ${target.pathname} passed in Chromium; title=${title || "(empty)"}.`;
    status = "passed";
    await context.close();
  } catch (error) {
    status = "failed";
    summary =
      blockedNavigation ||
      (error instanceof Error
        ? error.message
        : "Preview browser smoke failed.");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        status = "failed";
        summary =
          error instanceof Error
            ? error.message
            : "Preview browser shutdown failed.";
      }
    }
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
