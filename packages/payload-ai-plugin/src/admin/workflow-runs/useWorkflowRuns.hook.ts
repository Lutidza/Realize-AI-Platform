/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRuns.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Загружает серверную страницу запусков с отменой устаревших запросов.
 */

"use client";

import { useEffect, useState } from "react";
import type { WorkflowRunListDTO } from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";

export const useWorkflowRuns = (search?: string) => {
  const [resource, setResource] = useState<{
    search: string;
    revision: number;
    data?: WorkflowRunListDTO;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (search === undefined) return;
    const abort = new AbortController();
    void requestRealizeAI<WorkflowRunListDTO>(`/workflow-runs?${search}`, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
    })
      .then((data) => {
        if (!abort.signal.aborted) setResource({ search, revision, data });
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setResource({
            search,
            revision,
            error:
              cause instanceof Error
                ? cause.message
                : "Не удалось загрузить запуски.",
          });
      });
    return () => abort.abort();
  }, [search, revision]);
  const current =
    resource?.search === search && resource?.revision === revision;
  return {
    data: search === undefined ? undefined : resource?.data,
    error: current ? resource?.error : undefined,
    loading: search !== undefined && !current,
    refresh: () => setRevision((value) => value + 1),
  };
};
