/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatDeepLink.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Открывает указанный диалог через существующий controller с защитой текущего запроса.
 */
"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation.js";
import { readAIRecordLinkID } from "../realizeAILinks.util";
import type { ChatDeepLinkOptions } from "./ChatDeepLink.types";

/** Выбор по URL не очищает текст, вложения или настройки следующего сообщения. */
export const useChatDeepLink = ({
  controller,
  enabled,
  onNotice,
}: ChatDeepLinkOptions): void => {
  const query = useSearchParams();
  const identity = query.toString();
  const handled = useRef<string | undefined>(undefined);
  const blockedNotice = useRef(false);
  const latest = useRef(identity);
  const blocked = Boolean(
    controller.isSubmitting ||
    controller.isCreatingConversation ||
    controller.workflow.isPending ||
    controller.workflow.hasRetry ||
    controller.pendingWorkflowConversationID,
  );
  const selectedID = controller.selectedConversationID;
  useEffect(() => {
    latest.current = identity;
    if (!enabled) {
      handled.current = undefined;
      return;
    }
    if (handled.current === identity) return;
    let conversationID;
    try {
      conversationID = readAIRecordLinkID(
        new URLSearchParams(identity),
        "conversation",
      );
    } catch (error) {
      handled.current = identity;
      onNotice((error as Error).message);
      return;
    }
    if (
      !conversationID ||
      controller.selectedConversationID === conversationID
    ) {
      handled.current = identity;
      return;
    }
    if (blocked) {
      blockedNotice.current = true;
      onNotice(
        "Сначала завершите текущую отправку или повтор неподтверждённого запроса. Ссылка на диалог сохранена.",
      );
      return;
    }
    handled.current = identity;
    if (blockedNotice.current) {
      blockedNotice.current = false;
      onNotice(undefined);
    }
    void controller.openConversation(conversationID).catch(() => {
      if (latest.current === identity)
        onNotice(
          "Не удалось открыть диалог по ссылке. Проверьте доступ и обновите страницу для повтора.",
        );
    });
  }, [blocked, controller, enabled, identity, onNotice, selectedID]);
};
