/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatWorkflow.hook.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Связывает выбор процесса и режим ответа чата с общим continuation owner.
 */

"use client";

import { useState } from "react";
import type { AIChatConfigurationSelection } from "@realize/ai-contracts";
import { isActiveRun } from "../runStreamTypes";
import type {
  ChatWorkflowController,
  ChatWorkflowOptions,
} from "./ChatWorkflow.types";
import { getChatWorkflowRuns } from "./getChatWorkflowRuns.util";
import { getWorkflowRunRootId } from "./getWorkflowRunRootId.util";
import { parseChatWorkflowInput } from "./parseChatWorkflowInput.validator";
import { useWorkflowContinuation } from "./useWorkflowContinuation.hook";

/** Новый выпуск не подменяет выбранный процесс; продолжение использует только checkpoint. */
export const useChatWorkflow = (
  options: ChatWorkflowOptions,
): ChatWorkflowController => {
  const { configuration, detail, currentRun } = options;
  const [selection, setSelection] = useState<{
    key: string;
    profile?: AIChatConfigurationSelection;
  }>();
  const [inputText, setInputText] = useState("");
  const [selectedRoot, setSelectedRoot] = useState<string>();
  const [replyChoice, setReplyChoice] = useState<{
    runID: string;
    enabled: boolean;
  }>();
  const profile = configuration.selection;
  const selectedProfile = configuration.catalog?.profiles.find(
    (item) => item.key === profile?.profileKey,
  );
  const runs = getChatWorkflowRuns(detail?.runs ?? [], currentRun);
  const selectedRun =
    runs.find((item) => getWorkflowRunRootId(item) === selectedRoot) ?? runs[0];
  const queuedRecovery =
    selectedRun?.status === "queued" &&
    selectedRun.workflow?.phase === "running";
  const continuation = useWorkflowContinuation({
    run: selectedRun,
    runs,
    conversationID: detail?.conversation.id,
    archived: detail?.conversation.status === "archived",
    enabled: options.enabled,
    ready: options.ready,
    busy:
      options.busy ||
      (isActiveRun(currentRun) &&
        !(queuedRecovery && currentRun.id === selectedRun?.id)),
    draft: options.draft,
    hasContext: options.hasContext,
    setDraft: options.setDraft,
    setError: options.setError,
    acceptResult: options.acceptResult,
    refresh: async (run) => {
      const next = await options.refreshConversation(run.conversationID);
      return getChatWorkflowRuns(next.runs).find(
        (item) => getWorkflowRunRootId(item) === getWorkflowRunRootId(run),
      );
    },
  });
  const run = continuation.run;
  const replying =
    run?.workflow?.phase === "awaiting_input" &&
    run.status === "completed" &&
    (replyChoice?.runID !== run.id || replyChoice.enabled);
  const isSelectionReady =
    !selection ||
    Boolean(
      configuration.isReady &&
      selection.profile &&
      profile &&
      selection.profile.releaseID === profile.releaseID &&
      selection.profile.manifestHash === profile.manifestHash &&
      selection.profile.profileKey === profile.profileKey &&
      selectedProfile?.workflows?.some((item) => item.key === selection.key),
    );

  return {
    key: selection?.key ?? "",
    inputText,
    isSelectionReady,
    isPending: continuation.isPending,
    hasRetry: continuation.hasRetry,
    isRefreshing: continuation.isRefreshing,
    isReplying: Boolean(replying),
    canContinue: continuation.canContinue,
    run,
    runs,
    error: continuation.error,
    pendingConversationID: continuation.pendingConversationID,
    select: (key) => {
      setSelection(key ? { key, profile } : undefined);
      continuation.clearError();
    },
    selectRun: (id) => {
      if (continuation.isLocked) return;
      const selected = runs.find((item) => item.id === id);
      if (selected) {
        setSelectedRoot(getWorkflowRunRootId(selected));
        continuation.clearError();
      }
    },
    setInputText,
    setReplying: (value) => {
      if (run) setReplyChoice({ runID: run.id, enabled: value });
    },
    readStart: () => {
      if (selection && continuation.isLocked)
        throw new Error(
          "Сначала повторите неподтверждённое продолжение процесса.",
        );
      if (!isSelectionReady)
        throw new Error("Выберите доступный процесс для текущего профиля.");
      return selection
        ? parseChatWorkflowInput(selection.key, inputText)
        : undefined;
    },
    readDraft: () => ({
      key: selection?.key ?? "",
      inputText,
      ...(selection?.profile ? { profile: { ...selection.profile } } : {}),
    }),
    restoreDraft: (draft) => {
      setSelection(
        draft?.key
          ? {
              key: draft.key,
              profile: draft.profile ? { ...draft.profile } : undefined,
            }
          : undefined,
      );
      setInputText(draft?.inputText ?? "");
      continuation.clearError();
    },
    clearSentSelection: () => {
      setSelection(undefined);
      setInputText("");
      setSelectedRoot(undefined);
    },
    continue: continuation.continue,
    refresh: continuation.refresh,
  };
};
