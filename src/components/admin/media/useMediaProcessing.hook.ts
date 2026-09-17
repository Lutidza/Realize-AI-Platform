/**
 * @file src/components/admin/media/useMediaProcessing.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Загружает наборы Media, отменяет устаревшие запросы и обновляет только незавершённую обработку.
 * @see documentation/specifications/media-management.md
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaProcessingStatusDTO } from "@/collections/Media/MediaProcessingStatus.types";

async function responseError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error.slice(0, 500)
      : response.status === 409
        ? "Состояние файла изменилось. Обновите список обработки."
        : "Не удалось выполнить запрос обработки. Попробуйте ещё раз.";
  return new Error(message);
}

/** POST выполняется только явным действием; повторные клики не запускают второй запрос. */
export function useMediaProcessing(endpoint: string) {
  const [page, setPageValue] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    value: MediaProcessingStatusDTO;
  }>();
  const [error, setError] = useState<string>();
  const [isLoading, setLoading] = useState(true);
  const [isMutating, setMutating] = useState(false);
  const actionRequest = useRef<AbortController | null>(null);
  const key = `${endpoint}?page=${page}`;

  useEffect(() => {
    const request = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const response = await fetch(key, {
          credentials: "include",
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw await responseError(response);
        const value: MediaProcessingStatusDTO = await response.json();
        if (request.signal.aborted) return;
        setResult({ key, value });
        setError(undefined);
        if (
          value.sets.some(
            (set) => set.status === "queued" || set.status === "processing",
          )
        ) {
          timer = setTimeout(() => void read(), 5000);
        }
      } catch (cause) {
        if (!request.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось загрузить обработку.",
          );
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }
    void read();
    return () => {
      request.abort();
      clearTimeout(timer);
    };
  }, [key, revision]);

  useEffect(() => () => actionRequest.current?.abort(), [endpoint]);

  const refresh = useCallback(() => {
    setError(undefined);
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  const changePage = useCallback((value: number) => {
    if (!Number.isSafeInteger(value) || value < 1) return;
    setError(undefined);
    setLoading(true);
    setPageValue(value);
  }, []);

  const mutate = useCallback(
    async (setID?: string | number) => {
      if (actionRequest.current) return;
      const request = new AbortController();
      actionRequest.current = request;
      setMutating(true);
      setError(undefined);
      try {
        const response = await fetch(
          setID === undefined
            ? endpoint
            : `${endpoint}/${encodeURIComponent(String(setID))}/retry`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: request.signal,
          },
        );
        if (!response.ok) throw await responseError(response);
        if (request.signal.aborted) return;
        setPageValue(1);
        setLoading(true);
        setRevision((value) => value + 1);
      } catch (cause) {
        if (!request.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось запустить обработку.",
          );
      } finally {
        if (actionRequest.current === request) actionRequest.current = null;
        if (!request.signal.aborted) setMutating(false);
      }
    },
    [endpoint],
  );

  return {
    data: result?.key === key ? result.value : undefined,
    page,
    error,
    isLoading,
    isMutating,
    changePage,
    refresh,
    queue: () => mutate(),
    retry: (setID: string | number) => mutate(setID),
  };
}
