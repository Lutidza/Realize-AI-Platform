/**
 * @file packages/payload-ai-plugin/src/admin/usage/useUsageCommand.hook.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Отправляет команды с сохранением idempotency key для точного повторения формы.
 */
"use client";
import { useRef, useState } from "react";
import type { APIResponse } from "@realize/ai-contracts";

export function useUsageCommand(url: string, onSaved: () => void) {
  const previous = useRef<{ body: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const run = async (build: () => unknown) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    try {
      const body = JSON.stringify(build());
      if (previous.current?.body !== body)
        previous.current = { body, key: crypto.randomUUID() };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": previous.current!.key,
        },
        body,
      });
      const result = (await response.json()) as APIResponse<unknown>;
      if (!response.ok || !result.ok)
        throw new Error(
          result.ok ? "Не удалось сохранить." : result.error.message,
        );
      setSaved(true);
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Не удалось сохранить.",
      );
    } finally {
      setPending(false);
    }
  };
  return { run, pending, error, saved };
}
