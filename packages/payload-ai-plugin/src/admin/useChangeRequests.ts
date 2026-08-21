/**
 * @file packages/payload-ai-plugin/src/admin/useChangeRequests.ts
 * @version 2026-08-21
 * @description Owns plan, execution, promotion and acceptance actions.
 */

"use client";

import type {
  ChangeRequestDTO,
  ConversationDetailDTO,
} from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import { chatErrorMessage, upsertChange } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";

type UseChangeRequestsOptions = {
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
};

/** Returns isolated plan actions while the parent owns conversation state. */
export const useChangeRequests = ({
  detailRef,
  setDetail,
  setError,
}: UseChangeRequestsOptions) => {
  const [isPlanActionPending, setIsPlanActionPending] = useState<string>();

  const createChangeRequest = useCallback(
    async (messageID: string) => {
      const conversationID = detailRef.current?.conversation.id;
      if (!conversationID) return;
      setIsPlanActionPending(messageID);
      setError(undefined);
      try {
        const change = await requestRealizeAI<ChangeRequestDTO>(
          `/conversations/${conversationID}/changes`,
          {
            body: JSON.stringify({ sourceMessageID: messageID }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current || current.conversation.id !== conversationID) {
            return current;
          }
          const next = upsertChange(current, change);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось оформить Change Request."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  const decideChangeRequest = useCallback(
    async (
      change: ChangeRequestDTO,
      decision: "approve" | "reject",
      comment?: string,
    ) => {
      setIsPlanActionPending(change.id);
      setError(undefined);
      try {
        const decided = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/${decision === "approve" ? "approve-plan" : "reject-plan"}`,
          {
            body: JSON.stringify({ comment, expectedVersion: change.version }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current) return current;
          const next = upsertChange(current, decided);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось сохранить решение по плану."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  const executeChangeRequest = useCallback(
    async (change: ChangeRequestDTO) => {
      setIsPlanActionPending(change.id);
      setError(undefined);
      try {
        const queued = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/execute`,
          {
            body: JSON.stringify({ expectedVersion: change.version }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current) return current;
          const next = upsertChange(current, queued);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось поставить execution в очередь."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  const decideImplementation = useCallback(
    async (
      change: ChangeRequestDTO,
      decision: "approve" | "reject",
      comment?: string,
    ) => {
      const diffHash = change.execution.job?.diffHash;
      if (!diffHash) return;
      setIsPlanActionPending(change.id);
      setError(undefined);
      try {
        const decided = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/${
            decision === "approve"
              ? "accept-implementation"
              : "reject-implementation"
          }`,
          {
            body: JSON.stringify({
              comment,
              expectedDiffHash: diffHash,
              expectedVersion: change.version,
            }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current) return current;
          const next = upsertChange(current, decided);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось сохранить решение по diff."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  const deployPreview = useCallback(
    async (change: ChangeRequestDTO) => {
      const diffHash = change.execution.job?.diffHash;
      if (!diffHash) return;
      setIsPlanActionPending(change.id);
      setError(undefined);
      try {
        const queued = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/deploy-preview`,
          {
            body: JSON.stringify({
              expectedDiffHash: diffHash,
              expectedVersion: change.version,
            }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current) return current;
          const next = upsertChange(current, queued);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось поставить preview в очередь."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  const decidePreview = useCallback(
    async (
      change: ChangeRequestDTO,
      decision: "approve" | "reject",
      comment?: string,
    ) => {
      const artifactHash = change.preview.deployment?.artifactHash;
      if (!artifactHash) return;
      setIsPlanActionPending(change.id);
      setError(undefined);
      try {
        const decided = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/${
            decision === "approve" ? "accept-preview" : "reject-preview"
          }`,
          {
            body: JSON.stringify({
              comment,
              expectedArtifactHash: artifactHash,
              expectedVersion: change.version,
            }),
            headers: { "Idempotency-Key": crypto.randomUUID() },
            method: "POST",
          },
        );
        setDetail((current) => {
          if (!current) return current;
          const next = upsertChange(current, decided);
          detailRef.current = next;
          return next;
        });
      } catch (cause) {
        setError(
          chatErrorMessage(cause, "Не удалось сохранить решение по preview."),
        );
      } finally {
        setIsPlanActionPending(undefined);
      }
    },
    [detailRef, setDetail, setError],
  );

  return {
    createChangeRequest,
    decideChangeRequest,
    decideImplementation,
    decidePreview,
    deployPreview,
    executeChangeRequest,
    isPlanActionPending,
  };
};
