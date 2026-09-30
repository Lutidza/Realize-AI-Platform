/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/useWorkshopPreview.hook.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Восстанавливает задания после reload, опрашивает видимую вкладку и сохраняет ключ повтора запуска.
 * @see documentation/specifications/design-workshop.md
 */
"use client";
import { useEffect, useRef, useState } from "react";
import {
  designPreviewJobSchema,
  type DesignPreviewJobDto,
} from "@realize/ai-contracts";
import {
  DesignWorkshopApi,
  WorkshopRequestError,
  workshopErrorMessage,
} from "./DesignWorkshopApi.client";
import { WORKSHOP_PREVIEW_POLL_MS } from "./workshopPreview.constants";

export function useWorkshopPreview(
  projectId: string,
  revisionId: string,
  enabled: boolean,
) {
  const [api] = useState(() => new DesignWorkshopApi());
  const [items, setItems] = useState<DesignPreviewJobDto[]>([]);
  const [selectedId, select] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || busy) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const poll = async () => {
      clearTimeout(timer);
      request?.abort();
      if (stopped || document.hidden) return;
      const controller = new AbortController();
      request = controller;
      const epoch = ++generation.current;
      try {
        const page = await api.read<{ items: unknown[] }>(
          `/${projectId}/previews`,
          controller.signal,
        );
        const jobs = page.items.map((value) =>
          designPreviewJobSchema.parse(value),
        );
        if (selectedId && !jobs.some((job) => job.jobId === selectedId)) {
          jobs.push(
            designPreviewJobSchema.parse(
              await api.read(
                `/${projectId}/previews/${selectedId}`,
                controller.signal,
              ),
            ),
          );
        }
        if (
          stopped ||
          controller.signal.aborted ||
          epoch !== generation.current
        )
          return;
        setItems(jobs);
        setError(null);
        if (!selectedId)
          select(
            (
              jobs.find(
                (job) => job.source.revision.revisionId === revisionId,
              ) ?? jobs[0]
            )?.jobId ?? null,
          );
      } catch (failure) {
        if (
          stopped ||
          controller.signal.aborted ||
          epoch !== generation.current
        )
          return;
        setError(workshopErrorMessage(failure));
        if (
          failure instanceof WorkshopRequestError &&
          [401, 403, 404].includes(failure.status)
        ) {
          setItems([]);
          select(null);
        }
      } finally {
        if (
          !stopped &&
          !controller.signal.aborted &&
          epoch === generation.current
        ) {
          setLoading(false);
          timer = setTimeout(() => void poll(), WORKSHOP_PREVIEW_POLL_MS);
        }
      }
    };
    const visibility = () => {
      void poll();
    };
    document.addEventListener("visibilitychange", visibility);
    void poll();
    return () => {
      stopped = true;
      request?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [api, projectId, revisionId, enabled, selectedId, refresh, busy]);

  /** Mutation receipt может потеряться: API удерживает ключ до подтверждённого DTO. */
  const run = async (operation: () => Promise<DesignPreviewJobDto>) => {
    if (busy) return;
    generation.current++;
    setBusy(true);
    setActionError(null);
    try {
      const job = await operation();
      api.complete();
      if (!mounted.current) return;
      setItems((prior) => [
        job,
        ...prior.filter((item) => item.jobId !== job.jobId),
      ]);
      select(job.jobId);
    } catch (failure) {
      if (mounted.current) setActionError(workshopErrorMessage(failure));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setLoading(false);
        setRefresh((value) => value + 1);
      }
    }
  };
  return {
    items,
    selected: items.find((job) => job.jobId === selectedId) ?? null,
    select,
    error: actionError ?? error,
    loading,
    busy,
    imageVersion: refresh,
    active: items.some(
      (job) => job.state === "queued" || job.state === "running",
    ),
    start: (entryPath: string) =>
      run(() => api.startPreview(projectId, { revisionId, entryPath })),
    cancel: (jobId: string) => run(() => api.cancelPreview(projectId, jobId)),
    reload: () => {
      setActionError(null);
      setRefresh((value) => value + 1);
    },
  };
}
