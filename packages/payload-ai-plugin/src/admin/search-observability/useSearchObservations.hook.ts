/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchObservations.hook.ts
 * @version 1.4.0
 * @date 2026-11-03
 * @description Автоматически обновляет видимую историю без перекрывающихся запросов и сброса данных.
 */
"use client";
import { useEffect, useState } from "react";
import type { SearchObservationPage } from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import type {
  SearchObservationFilters,
  SearchObservationPeriod,
  SearchObservationResource,
} from "./SearchObservations.types";

export function useSearchObservations(apiURL: string) {
  const [filters, setFilters] = useState<SearchObservationFilters>({
    source: "",
    consumer: "",
    operation: "",
    outcome: "",
    hours: "24",
    from: "",
    to: "",
    slow: "",
    compareAt: "",
  });
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
    let loaded = false;
    const historical = new URLSearchParams(search).has("to");
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
          loaded = true;
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
          ((!historical && !search.includes("before=")) ||
            failures ||
            (historical && !loaded))
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
      } else if (!historical || !loaded) {
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
    historical: Boolean(filters.to),
    applyPeriod: (period: SearchObservationPeriod) => {
      setFilters((old) => ({ ...old, ...period }));
      setPages([]);
    },
    filter: (
      name: "source" | "consumer" | "operation" | "outcome" | "slow",
      value: string,
    ) => {
      setFilters((old) => ({ ...old, [name]: value }));
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
