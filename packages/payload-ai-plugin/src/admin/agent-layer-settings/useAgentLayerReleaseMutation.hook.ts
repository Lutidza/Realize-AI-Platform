/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerReleaseMutation.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Повторяет точный выпуск или активацию и сверяет независимые серверные проекции.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentLayerReleaseMutation,
  UseAgentLayerReleaseMutationOptions,
} from "./AgentLayerRelease.types";
import { parseAgentLayerFailure } from "./parseAgentLayerFailure.mapper";

export const useAgentLayerReleaseMutation = ({
  api,
  onStart,
  onFailure,
  onSuccess,
}: UseAgentLayerReleaseMutationOptions) => {
  const [isBusy, setIsBusy] = useState(false);
  const [hasPendingMutation, setHasPendingMutation] = useState(false);
  const pending = useRef<AgentLayerReleaseMutation | undefined>(undefined);
  const busy = useRef(false);
  const mounted = useRef(false);
  const requestRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, []);
  const run = useCallback(
    async (command: AgentLayerReleaseMutation): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setIsBusy(true);
      onStart();
      const request = new AbortController();
      requestRef.current = request;
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(20_000),
      ]);
      try {
        if (command.kind === "release") {
          command.receipt ??= await api.createRelease(
            command.input,
            command.idempotencyKey,
            signal,
          );
          const receipt = command.receipt;
          if (
            receipt.sourceDraftID !== command.input.draftID ||
            receipt.sourceDraftRevision !== command.input.expectedDraftRevision
          )
            throw new Error("Unexpected release receipt.");
          const [release, draft, bootstrap] = await Promise.all([
            api.release(receipt.id, signal),
            api.draft(command.input.draftID, signal),
            api.bootstrap(signal),
          ]);
          if (
            release.id !== receipt.id ||
            release.manifestHash !== receipt.manifestHash ||
            draft.id !== command.input.draftID ||
            draft.revision !== command.input.expectedDraftRevision + 1 ||
            draft.state !== "released"
          )
            throw new Error("Release projection is stale.");
          if (!mounted.current || request.signal.aborted) return false;
          onSuccess({ kind: "release", release, draft, bootstrap });
        } else {
          command.receipt ??= await api.activateRelease(
            command.input,
            command.idempotencyKey,
            signal,
          );
          const receipt = command.receipt;
          if (
            receipt.releaseID !== command.input.releaseID ||
            receipt.manifestHash !==
              command.input.expectedReleaseManifestHash ||
            receipt.version !== command.input.expectedPointerVersion + 1
          )
            throw new Error("Unexpected activation receipt.");
          const bootstrap = await api.bootstrap(signal);
          if (
            !bootstrap.activePointer ||
            bootstrap.activePointer.version < receipt.version ||
            (bootstrap.activePointer.version === receipt.version &&
              (bootstrap.activePointer.releaseID !== receipt.releaseID ||
                bootstrap.activePointer.manifestHash !== receipt.manifestHash))
          )
            throw new Error("Active configuration projection is stale.");
          if (!mounted.current || request.signal.aborted) return false;
          onSuccess({ kind: "activate", receipt, bootstrap });
        }
        pending.current = undefined;
        setHasPendingMutation(false);
        return true;
      } catch (cause) {
        if (!mounted.current || request.signal.aborted) return false;
        const failure = parseAgentLayerFailure(cause);
        if (!failure.retryable) {
          pending.current = undefined;
          setHasPendingMutation(false);
        }
        onFailure(
          command.receipt && failure.retryable
            ? {
                ...failure,
                message:
                  "Операция подтверждена сервером, но результат не удалось прочитать. Повторите загрузку результата.",
              }
            : failure.kind === "conflict"
              ? {
                  ...failure,
                  message:
                    "Черновик, активный выпуск или системная основа изменились. Обновите состояние и просмотрите выпуск перед повторным действием.",
                }
              : failure,
        );
        return false;
      } finally {
        busy.current = false;
        if (mounted.current) setIsBusy(false);
      }
    },
    [api, onFailure, onStart, onSuccess],
  );
  const execute = useCallback(
    (command: AgentLayerReleaseMutation) => {
      if (busy.current || pending.current) return Promise.resolve(false);
      pending.current = structuredClone(command);
      setHasPendingMutation(true);
      return run(pending.current);
    },
    [run],
  );
  const retry = useCallback(
    () => (pending.current ? run(pending.current) : Promise.resolve(false)),
    [run],
  );
  const isLocked = useCallback(
    () => busy.current || Boolean(pending.current),
    [],
  );
  return { isBusy, hasPendingMutation, execute, retry, isLocked };
};
