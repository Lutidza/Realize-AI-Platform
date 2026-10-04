/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchQualityImport.hook.ts
 * @version 1.0.1
 * @date 2026-09-30
 * @description Импортирует только bounded контрольные summaries benchmark, сохраняя IDs для безопасного повтора.
 * @see documentation/architecture/repository-search.md
 */
"use client";
import { useEffect, useRef, useState } from "react";
import { searchQualityImportSchema } from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";

/** Отчёт может содержать rows; на сервер уходят только валидированные summaries без кода и путей. */
export function useSearchQualityImport(apiURL: string, onChange: () => void) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  return {
    loading,
    status,
    error,
    importReport: async (file: File) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      setLoading(true);
      setError("");
      setStatus("");
      try {
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Размер отчёта должен быть не больше 2 MiB.");
        let report: unknown;
        try {
          report = JSON.parse(await file.text());
        } catch {
          throw new Error("Отчёт должен содержать корректный JSON.");
        }
        if (!report || typeof report !== "object" || Array.isArray(report))
          throw new Error("Отчёт должен содержать объект с qualityRuns.");
        const input = searchQualityImportSchema.safeParse({
          runs:
            "qualityRuns" in report
              ? report.qualityRuns
              : "runs" in report
                ? report.runs
                : undefined,
        });
        if (!input.success)
          throw new Error(
            "В отчёте нужны qualityRuns с известными целями, версиями и фазой кеша.",
          );
        const result = await requestRealizeAI<{
          inserted: number;
          retained: number;
        }>(
          "/search-observations/quality-import",
          {
            method: "POST",
            body: JSON.stringify(input.data),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          },
          apiURL,
        );
        if (!controller.signal.aborted) {
          setStatus(
            `Добавлено контрольных замеров: ${result.inserted}. В истории: ${result.retained}.`,
          );
          onChange();
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось импортировать отчёт.",
          );
      } finally {
        active.current = undefined;
        if (!controller.signal.aborted) setLoading(false);
      }
    },
  };
}
