/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerMutation.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Повторяет неизвестный результат с тем же body/key и отдельно сверяет сохранённый draft.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AIConfigDraftSummaryDTO,
  AIConfigValidationDTO,
} from "@realize/ai-contracts";
import type { AgentLayerMutation } from "./AgentLayerConfiguration.types";
import type {
  UseAgentLayerMutationOptions,
  UseAgentLayerMutationResult,
} from "./AgentLayerMutation.types";
import { parseAgentLayerFailure } from "./parseAgentLayerFailure.mapper";

export const useAgentLayerMutation = ({
  api,
  onFailure,
  onStart,
  onSuccess,
}: UseAgentLayerMutationOptions): UseAgentLayerMutationResult => {
  const [isBusy, setIsBusy] = useState(false);
  const [hasPendingMutation, setHasPendingMutation] = useState(false);
  const pendingRef = useRef<AgentLayerMutation | undefined>(undefined);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const requestRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (command: AgentLayerMutation): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setIsBusy(true);
      onStart();
      const request = new AbortController();
      requestRef.current = request;
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(20_000),
      ]);
      try {
        if (!command.receipt) {
          const receipt = await api.mutate(command, signal);
          if (command.kind === "validate")
            command.receipt = receipt as AIConfigValidationDTO;
          else command.receipt = receipt as AIConfigDraftSummaryDTO;
        }
        const receipt = command.receipt;
        if (!receipt) throw new Error("Configuration receipt is missing.");
        const receiptID = "draftID" in receipt ? receipt.draftID : receipt.id;
        if (receiptID !== command.draftID)
          throw new Error("Unexpected configuration receipt.");
        const draft = await api.draft(command.draftID, signal);
        const resultingRevision =
          "resultingRevision" in receipt
            ? receipt.resultingRevision
            : receipt.revision;
        if (draft.id !== command.draftID || draft.revision < resultingRevision)
          throw new Error("Configuration projection is stale.");
        if (!mountedRef.current || request.signal.aborted) return false;
        pendingRef.current = undefined;
        setHasPendingMutation(false);
        // Более новая проекция не может молча повысить CAS под оставшимся в форме старым правилом.
        if (draft.revision > resultingRevision) {
          onFailure({
            kind: "conflict",
            message:
              "Запись подтверждена, но черновик уже изменён другим редактором. Ваши правки сохранены в форме. Загрузите актуальную версию перед продолжением.",
            retryable: false,
          });
          return false;
        }
        onSuccess(
          draft,
          command.kind,
          command.kind === "validate" && "resultingRevision" in receipt
            ? receipt
            : undefined,
        );
        return true;
      } catch (error) {
        if (!mountedRef.current || request.signal.aborted) return false;
        const failure = parseAgentLayerFailure(error);
        if (!failure.retryable) {
          pendingRef.current = undefined;
          setHasPendingMutation(false);
        }
        onFailure(
          command.receipt && failure.retryable
            ? {
                ...failure,
                message:
                  "Изменения подтверждены сервером, но черновик не удалось прочитать. Повторите загрузку результата.",
              }
            : failure,
        );
        return false;
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setIsBusy(false);
      }
    },
    [api, onFailure, onStart, onSuccess],
  );
  const execute = useCallback(
    async (command: AgentLayerMutation): Promise<boolean> => {
      if (pendingRef.current || busyRef.current) return false;
      pendingRef.current = structuredClone(command);
      setHasPendingMutation(true);
      return run(pendingRef.current);
    },
    [run],
  );
  const retry = useCallback(
    async () => (pendingRef.current ? run(pendingRef.current) : false),
    [run],
  );
  const isLocked = useCallback(
    () => Boolean(pendingRef.current) || busyRef.current,
    [],
  );
  return { isBusy, hasPendingMutation, isLocked, execute, retry };
};
