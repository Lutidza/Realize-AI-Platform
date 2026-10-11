/**
 * @file packages/payload-ai-plugin/src/admin/usage/useUsageDashboard.hook.ts
 * @version 1.2.0
 * @date 2026-10-06
 * @description Управляет фильтрами, курсором и отменой устаревших запросов аналитики.
 */
"use client";
import { useEffect, useState } from "react";
import type { APIResponse } from "@realize/ai-contracts";
import type { UsagePageData, UsageFilters } from "./UsageView.types";

const initialUsageFilters: UsageFilters = {
  source: "",
  projectId: "",
  systemReleaseId: "",
  overlayReleaseId: "",
  modelCatalogRevision: "",
  routerPolicyVersion: "",
  days: "30",
  model: "",
  outcome: "",
  workflowKey: "",
  agentProfileKey: "",
  installationId: "",
  purpose: "",
};

export function useUsageDashboard(apiUrl: string) {
  const [filters, setFilters] = useState<UsageFilters>(initialUsageFilters);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: UsagePageData;
    error?: string;
  }>();
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== ""),
  );
  if (cursor) params.set("before", cursor);
  const url = `${apiUrl}?${params}`;
  const key = `${url}#${revision}`;
  const current = result?.key === key ? result : undefined;
  const data = current?.data;
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void fetch(url, {
        signal: abort.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const result = (await response.json()) as APIResponse<UsagePageData>;
          if (!response.ok || !result.ok)
            throw new Error(
              result.ok
                ? "Не удалось загрузить расходы."
                : result.error.message,
            );
          if (!abort.signal.aborted) setResult({ key, data: result.data });
        })
        .catch((reason) => {
          if (!abort.signal.aborted)
            setResult({
              key,
              error:
                reason instanceof Error
                  ? reason.message
                  : "Ошибка загрузки расходов.",
            });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [url, key]);
  return {
    data,
    filterOptions: result?.data?.filterOptions,
    error: current?.error,
    loading: !current,
    filters,
    cursor,
    filter: (key: keyof UsageFilters, value: string) => {
      setCursor(null);
      setFilters((current) => ({ ...current, [key]: value }));
    },
    patchFilters: (patch: Partial<UsageFilters>) => {
      setCursor(null);
      setFilters((current) => ({ ...current, ...patch }));
    },
    resetFilters: () => {
      setCursor(null);
      setFilters((current) => ({ ...initialUsageFilters, days: current.days }));
    },
    next: () => setCursor(data?.nextCursor ?? null),
    refresh: () => {
      setCursor(null);
      setRevision((value) => value + 1);
    },
  };
}
