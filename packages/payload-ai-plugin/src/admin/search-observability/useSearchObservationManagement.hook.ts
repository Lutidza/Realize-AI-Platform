/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchObservationManagement.hook.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Синхронизирует состояние диагностики, сохраняя ввод, CAS и ключ повторения операций.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import {
  searchObservationSettingsSchema,
  type SearchObservationManagement,
  type SearchObservationCleanupMode,
  type SearchObservationCleanupPreview,
  type SearchObservationMutationResult,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import { RealizeAIRequestError } from "../RealizeAIRequest.error";
import type {
  SearchObservationSettingsDraft,
  SearchObservationSettingsFields,
} from "./SearchObservationManagement.types";

export function useSearchObservationManagement(
  apiURL: string,
  onChange: () => void,
) {
  const [data, setData] = useState<SearchObservationManagement>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<SearchObservationSettingsDraft>();
  const [preview, setPreview] =
    useState<SearchObservationCleanupPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const [request, setRequest] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);

  useEffect(
    () => () => {
      mutation.current?.abort();
    },
    [apiURL],
  );
  useEffect(() => {
    const lifetime = new AbortController();
    let active: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const load = async () => {
      if (lifetime.signal.aborted || active || document.hidden) return;
      if (timer) clearTimeout(timer);
      const current = new AbortController();
      active = current;
      const signal = AbortSignal.any([
        lifetime.signal,
        current.signal,
        AbortSignal.timeout(10000),
      ]);
      try {
        const result = await requestRealizeAI<SearchObservationManagement>(
          "/search-observations/control",
          { signal },
          apiURL,
        );
        if (!signal.aborted) {
          setData((previous) =>
            previous && previous.revision > result.revision ? previous : result,
          );
          setLoadError(null);
          failures = 0;
        }
      } catch (failure) {
        if (!lifetime.signal.aborted && !current.signal.aborted) {
          failures++;
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "Не удалось обновить состояние диагностики.",
          );
        }
      } finally {
        active = undefined;
        if (!lifetime.signal.aborted && !document.hidden)
          timer = setTimeout(
            () => void load(),
            Math.min(60000, 10000 * 2 ** Math.min(failures, 3)),
          );
      }
    };
    const visibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        active?.abort();
      } else void load();
    };
    void load();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      lifetime.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [apiURL, reload]);

  const fields: SearchObservationSettingsFields | undefined =
    draft?.fields ??
    (data
      ? {
          retentionDays: String(data.settings.retentionDays),
          capacity: String(data.settings.capacity),
          cleanupIntervalMinutes: String(data.settings.cleanupIntervalMinutes),
        }
      : undefined);

  async function run<T>(
    action: (signal: AbortSignal) => Promise<T>,
    success: (result: T) => void,
  ) {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    mutation.current = controller;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action(
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      );
      if (!controller.signal.aborted) success(result);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof RealizeAIRequestError
            ? failure.message
            : "Ответ не получен. Повторите действие: ключ запроса сохранён, повторное удаление исключено.",
        );
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function mutate(path: string, body: unknown, signal: AbortSignal) {
    const serialized = JSON.stringify(body);
    const fingerprint = `${path}:${serialized}`;
    const activeRequest =
      request?.fingerprint === fingerprint
        ? request
        : { fingerprint, key: crypto.randomUUID() };
    setRequest(activeRequest);
    return requestRealizeAI<SearchObservationMutationResult>(
      path,
      {
        method: "POST",
        body: serialized,
        signal,
        headers: { "Idempotency-Key": activeRequest.key },
      },
      apiURL,
    );
  }

  function changed(result: SearchObservationMutationResult) {
    setRequest(null);
    setMessage(
      `${result.kind === "settings" ? "Настройки применены" : "Очистка завершена"}. Удалено записей: ${result.deletedCount.toLocaleString("ru-RU")}.`,
    );
    setReload((value) => value + 1);
    onChange();
  }

  // Потерянный ответ своей уже выполненной операции не является конфликтом чужой сессии.
  const settingsRequest =
    data && fields
      ? {
          expectedRevision: draft?.revision ?? data.revision,
          settings: {
            retentionDays: Number(fields.retentionDays),
            capacity: Number(fields.capacity),
            cleanupIntervalMinutes: Number(fields.cleanupIntervalMinutes),
          },
        }
      : undefined;
  const canReplaySettings = Boolean(
    settingsRequest &&
    request &&
    request.fingerprint ===
      `/search-observations/settings:${JSON.stringify(settingsRequest)}` &&
    data?.actions.some((action) => action.requestID === request.key),
  );

  return {
    data,
    fields,
    pending,
    error,
    message,
    loadError,
    preview,
    dirty: Boolean(draft),
    conflict: Boolean(
      draft && data && draft.revision !== data.revision && !canReplaySettings,
    ),
    refresh: () => setReload((value) => value + 1),
    edit: (name: keyof SearchObservationSettingsFields, value: string) => {
      if (!data || !fields || busy.current) return;
      setDraft({
        revision: draft?.revision ?? data.revision,
        fields: { ...fields, [name]: value },
      });
      setMessage(null);
      setError(null);
    },
    reset: () => {
      setDraft(undefined);
      setError(null);
    },
    save: () => {
      if (!data || !fields) return;
      const settings = searchObservationSettingsSchema.safeParse({
        retentionDays: Number(fields.retentionDays),
        capacity: Number(fields.capacity),
        cleanupIntervalMinutes: Number(fields.cleanupIntervalMinutes),
      });
      if (!settings.success) {
        setError("Проверьте допустимые значения настроек.");
        return;
      }
      void run(
        (signal) =>
          mutate(
            "/search-observations/settings",
            {
              expectedRevision: draft?.revision ?? data.revision,
              settings: settings.data,
            },
            signal,
          ),
        (result) => {
          setDraft(undefined);
          changed(result);
        },
      );
    },
    prepare: (mode: SearchObservationCleanupMode) => {
      void run(
        (signal) =>
          requestRealizeAI<SearchObservationCleanupPreview>(
            `/search-observations/cleanup-preview?mode=${mode}`,
            { signal },
            apiURL,
          ),
        setPreview,
      );
    },
    closePreview: () => {
      if (!busy.current) {
        setPreview(null);
        setError(null);
      }
    },
    confirm: () => {
      if (!preview) return;
      void run(
        (signal) => mutate("/search-observations/cleanup", { preview }, signal),
        (result) => {
          setPreview(null);
          changed(result);
        },
      );
    },
  };
}
