/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/useMcpRequest.hook.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Сохраняет ключ повторения при неизвестном результате записи и безопасную ошибку формы.
 */
"use client";
import { useCallback, useRef, useState } from "react";
import { requestRealizeAI } from "../realizeAIAPI";
import { RealizeAIRequestError } from "../RealizeAIRequest.error";

/** Ключ живёт только в памяти; идентичный retry не создаёт второй сервер или ключ. */
export function useMcpRequest(api: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const request = useCallback(
    async <T>(path: string, input?: unknown): Promise<T | undefined> => {
      if (active.current) return;
      active.current = true;
      setBusy(true);
      setError(null);
      const body = input === undefined ? undefined : JSON.stringify(input);
      const signature = `${path}:${body}`;
      if (body !== undefined && pending.current?.signature !== signature)
        pending.current = { signature, key: crypto.randomUUID() };
      try {
        const result = await requestRealizeAI<T>(
          path,
          body === undefined
            ? undefined
            : {
                method: "POST",
                body,
                headers: { "Idempotency-Key": pending.current!.key },
              },
          api,
        );
        if (body !== undefined) pending.current = null;
        return result;
      } catch (failure) {
        if (
          failure instanceof RealizeAIRequestError &&
          failure.status >= 400 &&
          failure.status < 500
        )
          pending.current = null;
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось выполнить запрос. Повторите попытку.",
        );
      } finally {
        active.current = false;
        setBusy(false);
      }
    },
    [api],
  );
  return { request, busy, error };
}
