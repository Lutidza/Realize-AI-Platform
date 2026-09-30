/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchObservations.hook.ts
 * @version 1.2.0
 * @date 2026-09-30
 * @description Автоматически обновляет видимую историю без перекрывающихся запросов и сброса данных.
 */
"use client";
import { useEffect, useState } from "react";
import type { SearchObservationPage } from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import type {
  SearchObservationFilters,
  SearchObservationResource,
} from "./SearchObservations.types";

export function useSearchObservations(apiURL: string) {
  const [filters, setFilters] = useState<SearchObservationFilters>({
    source: "",
    operation: "",
    outcome: "",
    hours: "24",
    slow: "",
    compareAt: "",
  });
  const [comparisonDraft, setComparisonDraft] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
  if (pages.length) params.set("before", pages.at(-1)!);
  const search = params.toString();
  const key = `${apiURL}:${search}:${revision}`;
  const [resource, setResource] = useState<SearchObservationResource>();
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | undefined;
    let failures = 0;
    const refresh = async () => {
      if (abort.signal.aborted || active || document.hidden) return;
      if (timer) clearTimeout(timer);
      const current = new AbortController();
      active = current;
      const signal = AbortSignal.any([
        abort.signal,
        current.signal,
        AbortSignal.timeout(10000),
      ]);
      try {
        const data = await requestRealizeAI<SearchObservationPage>(
          `/search-observations?${search}`,
          { signal },
          apiURL,
        );
        if (!signal.aborted) {
          failures = 0;
          setResource({ key, data, updatedAt: Date.now() });
        }
      } catch (error: unknown) {
        if (
          !abort.signal.aborted &&
          !current.signal.aborted &&
          !document.hidden
        ) {
          failures++;
          setResource((previous) => ({
            ...(previous?.key === key ? previous : {}),
            key,
            error:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить диагностику.",
          }));
        }
      } finally {
        active = undefined;
        // Старые страницы остаются неподвижными; после ошибки автоматически восстанавливаются.
        if (
          !abort.signal.aborted &&
          !document.hidden &&
          (!search.includes("before=") || failures)
        ) {
          timer = setTimeout(
            () => void refresh(),
            Math.min(30000, 2000 * 2 ** Math.min(failures, 4)),
          );
        }
      }
    };
    const visibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        active?.abort();
      } else {
        void refresh();
      }
    };
    void refresh();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [apiURL, search, key]);
  return {
    filters,
    loading: resource?.key !== key,
    data: resource?.key === key ? resource.data : undefined,
    error: resource?.key === key ? resource.error : undefined,
    updatedAt: resource?.key === key ? resource.updatedAt : undefined,
    comparisonDraft,
    comparisonError,
    setComparisonDraft: (value: string) => {
      setComparisonDraft(value);
      setComparisonError("");
    },
    applyComparison: () => {
      const splitAt = Date.parse(comparisonDraft);
      const now = Date.now();
      if (
        !Number.isFinite(splitAt) ||
        splitAt <= now - Number(filters.hours) * 3600000 ||
        splitAt >= now
      ) {
        setComparisonError("Выберите дату и время внутри выбранного периода.");
        return;
      }
      setComparisonError("");
      setFilters((old) => ({
        ...old,
        compareAt: new Date(splitAt).toISOString(),
      }));
      setPages([]);
    },
    clearComparison: () => {
      setComparisonDraft("");
      setComparisonError("");
      setFilters((old) => ({ ...old, compareAt: "" }));
      setPages([]);
    },
    filter: (name: keyof typeof filters, value: string) => {
      setFilters((old) => ({
        ...old,
        [name]: value,
        ...(name === "hours" ? { compareAt: "" } : {}),
      }));
      if (name === "hours") {
        setComparisonDraft("");
        setComparisonError("");
      }
      setPages([]);
    },
    refresh: () => {
      setPages([]);
      setRevision((value) => value + 1);
    },
    next: () => {
      if (resource?.data?.next)
        setPages((old) => [...old, resource.data!.next!]);
    },
    previous: () => setPages((old) => old.slice(0, -1)),
    hasPrevious: pages.length > 0,
  };
}
