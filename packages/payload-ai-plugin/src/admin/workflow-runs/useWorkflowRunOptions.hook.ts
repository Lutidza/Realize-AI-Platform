/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunOptions.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Ищет исторические ключи процессов и профилей отдельными серверными страницами.
 */

"use client";

import { useEffect, useState } from "react";
import type { WorkflowRunOptionsDTO } from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";

export const useWorkflowRunOptions = (
  kind: "workflow" | "profile",
  open: boolean,
  query: string,
  page: number,
) => {
  const [resource, setResource] = useState<{
    key: string;
    data?: WorkflowRunOptionsDTO;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([kind, query, page, revision]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({
          kind,
          query: query.trim(),
          page: String(page),
          pageSize: "25",
        });
        void requestRealizeAI<WorkflowRunOptionsDTO>(
          `/workflow-runs/options?${params}`,
          {
            signal: AbortSignal.any([
              abort.signal,
              AbortSignal.timeout(15_000),
            ]),
          },
        )
          .then((data) => {
            if (!abort.signal.aborted) setResource({ key, data });
          })
          .catch((cause: unknown) => {
            if (!abort.signal.aborted)
              setResource({
                key,
                error:
                  cause instanceof Error
                    ? cause.message
                    : "Не удалось загрузить варианты.",
              });
          });
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [kind, open, query, page, key]);
  return {
    data: resource?.data,
    error: resource?.key === key ? resource.error : undefined,
    loading: open && resource?.key !== key,
    refresh: () => setRevision((value) => value + 1),
  };
};
