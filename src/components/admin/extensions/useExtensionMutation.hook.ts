/**
 * @file src/components/admin/extensions/useExtensionMutation.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сохраняет UUID и payload при неизвестном исходе и разделяет lock независимых операций.
 */
"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExtensionManagerClientError } from "./ExtensionManagerClient.error";
import type {
  ExtensionMutationInput,
  ExtensionMutationLock,
  ExtensionPendingMutation,
} from "./ExtensionMutation.types";

const subscribeIdle = () => () => {};
const idleSnapshot = () => false;

export function useExtensionMutation<
  Input extends ExtensionMutationInput,
  Result,
>(
  invoke: (input: Input, requestId: string) => Promise<Result>,
  lock?: ExtensionMutationLock,
) {
  const [owner] = useState(() => Symbol("extension-mutation"));
  const sharedLocked = useSyncExternalStore(
    lock?.subscribe ?? subscribeIdle,
    lock?.getSnapshot ?? idleSnapshot,
    idleSnapshot,
  );
  const [pending, setPending] = useState<ExtensionPendingMutation<
    Input["kind"]
  > | null>(null);
  const [error, setError] = useState<ExtensionManagerClientError | null>(null);
  const frozen = useRef<ExtensionPendingMutation<Input["kind"]> | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lock?.release(owner);
    };
  }, [lock, owner]);
  async function execute(
    command: ExtensionPendingMutation<Input["kind"]>,
  ): Promise<Result | undefined> {
    if (busy.current) return;
    busy.current = true;
    const sending = { ...command, state: "sending" as const };
    frozen.current = sending;
    setPending(sending);
    setError(null);
    try {
      // Каждый retry получает свежую копию единственного замороженного wire payload.
      const result = await invoke(
        { kind: command.kind, input: JSON.parse(command.payload) } as Input,
        command.requestId,
      );
      frozen.current = null;
      lock?.release(owner);
      if (mounted.current) setPending(null);
      return result;
    } catch (cause) {
      const failure =
        cause instanceof ExtensionManagerClientError
          ? cause
          : new ExtensionManagerClientError(
              "Ответ не подтверждён. Повторите ту же операцию, чтобы выяснить результат.",
              "NETWORK_ERROR",
              0,
              "unknown",
            );
      frozen.current =
        failure.certainty === "unknown"
          ? { ...command, state: "uncertain" }
          : null;
      if (!frozen.current) lock?.release(owner);
      if (mounted.current) {
        setPending(frozen.current);
        setError(failure);
      }
    } finally {
      busy.current = false;
    }
  }
  const start = (input: Input) => {
    if (frozen.current || busy.current || lock?.getSnapshot())
      return Promise.resolve(undefined);
    const command: ExtensionPendingMutation<Input["kind"]> = {
      kind: input.kind,
      requestId: crypto.randomUUID(),
      payload: JSON.stringify(input.input),
      state: "sending",
    };
    if (lock && !lock.acquire(owner)) return Promise.resolve(undefined);
    return execute(command);
  };
  return {
    pending,
    error,
    start,
    retry: () =>
      frozen.current ? execute(frozen.current) : Promise.resolve(undefined),
    locked: sharedLocked || pending !== null,
    isLocked: () =>
      frozen.current !== null || busy.current || lock?.getSnapshot() === true,
  };
}
