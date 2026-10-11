/**
 * @file src/components/admin/task-manager/useTaskMutation.hook.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Сохраняет ключ повторной mutation и отображает отказ без потери ввода.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useEffect, useRef, useState } from "react";
import { TaskManagerClientError } from "./TaskManagerClient.error";

/** Повтор неизменённой команды использует тот же ключ, включая неизвестный сетевой исход. */
export function useTaskMutation<TInput, TResult>(
  save: (input: TInput, key: string) => Promise<TResult>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TaskManagerClientError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(input: TInput): Promise<TResult | undefined> {
    if (busy.current) return undefined;
    const signature = JSON.stringify(input);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await save(input, attempt.current.key);
      attempt.current = null;
      return result;
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof TaskManagerClientError
            ? cause
            : new TaskManagerClientError(
                "Сохранение не подтверждено. Проверьте соединение и повторите запрос.",
                "network_error",
                0,
              ),
        );
      return undefined;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { submit, pending, error, errorRef, setError };
}
