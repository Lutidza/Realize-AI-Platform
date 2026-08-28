/**
 * @file packages/payload-ai-plugin/src/admin/useSourcePromotion.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Владеет browser action постановки exact preview commit в source promotion queue.
 */

"use client";

import type {
  ChangeRequestDTO,
  ConversationDetailDTO,
} from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import { chatErrorMessage, upsertChange } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";

/** Возвращает isolated source-promotion action для parent-owned chat state. */
export const useSourcePromotion = (input: {
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setPending: Dispatch<SetStateAction<string | undefined>>;
}) => {
  const { detailRef, setDetail, setError, setPending } = input;

  return useCallback(
    async (change: ChangeRequestDTO) => {
      const deployment = change.preview.deployment;
      if (!deployment?.artifactHash || !deployment.commitSHA) return;
      setPending(change.id);
      setError(undefined);
      try {
        const queued = await requestRealizeAI<ChangeRequestDTO>(
          `/changes/${change.id}/publish-pull-request`,
          {
            body: JSON.stringify({
              expectedGitCommit: deployment.commitSHA,
              expectedPreviewArtifactHash: deployment.artifactHash,
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
          chatErrorMessage(
            cause,
            "Не удалось поставить Pull Request publication в очередь.",
          ),
        );
      } finally {
        setPending(undefined);
      }
    },
    [detailRef, setDetail, setError, setPending],
  );
};
