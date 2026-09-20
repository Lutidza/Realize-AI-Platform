/**
 * @file services/ai-execution-worker/src/previewBrowserPreflight.service.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет запуск Chromium до подготовки изолированного предпросмотра.
 */

import { createHash } from "node:crypto";

import { chromium } from "@playwright/test";

import type { WorkerCheckResult } from "./types";

/** Сохраняет отсутствие браузера или системных библиотек как обычную неуспешную проверку. */
export const runPreviewBrowserPreflight =
  async (): Promise<WorkerCheckResult> => {
    const started = new Date();
    let status: WorkerCheckResult["status"] = "failed";
    let summary = "";
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      status = "passed";
      summary = "Preview Chromium launch and shutdown passed.";
    } catch (error) {
      summary =
        error instanceof Error ? error.message : "Chromium preflight failed.";
    }
    const finished = new Date();
    return {
      command: "playwright preview preflight",
      durationMs: finished.getTime() - started.getTime(),
      evidenceHash: createHash("sha256")
        .update(JSON.stringify(["preview_preflight", status, summary]))
        .digest("hex"),
      finishedAt: finished.toISOString(),
      outputSummary: summary.slice(0, 8_000),
      startedAt: started.toISOString(),
      status,
    };
  };
