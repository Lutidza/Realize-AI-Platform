/**
 * @file packages/payload-ai-plugin/src/admin/chat/useConversationHistory.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Группирует историю по датам и хранит подтверждение архивирования.
 */

"use client";
import { useMemo, useState } from "react";
import type { ConversationDTO } from "@realize/ai-contracts";
import type { ConversationHistoryProps } from "./ConversationHistory.types";
export const useConversationHistory = ({
  conversations,
  search,
  onArchive,
}: ConversationHistoryProps) => {
  const [archiveTarget, setArchiveTarget] = useState<ConversationDTO>();
  const [isArchiving, setArchiving] = useState(false);
  const [error, setError] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const groups = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = now.getTime();
    const grouped = new Map<string, ConversationDTO[]>();
    const visible = conversations
      .filter(
        (item) =>
          (showArchived
            ? item.status === "archived"
            : item.status !== "archived") &&
          item.title
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
      )
      .sort(
        (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
      );
    for (const item of visible) {
      const age = (today - Date.parse(item.lastMessageAt)) / 86400000;
      const label =
        age < 0
          ? "Сегодня"
          : age < 1
            ? "Вчера"
            : age < 7
              ? "Последние 7 дней"
              : age < 30
                ? "Последние 30 дней"
                : "Ранее";
      grouped.set(label, [...(grouped.get(label) ?? []), item]);
    }
    return [...grouped].map(([label, items]) => ({ label, items }));
  }, [conversations, search, showArchived]);
  const confirmArchive = async () => {
    if (!archiveTarget || isArchiving) return;
    setArchiving(true);
    setError(undefined);
    try {
      await onArchive(archiveTarget.id);
      setArchiveTarget(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось архивировать диалог.",
      );
    } finally {
      setArchiving(false);
    }
  };
  return {
    groups,
    showArchived,
    setShowArchived,
    archiveTarget,
    isArchiving,
    error,
    confirmArchive,
    requestArchive: (item: ConversationDTO) => {
      setError(undefined);
      setArchiveTarget(item);
    },
    cancelArchive: () => setArchiveTarget(undefined),
  };
};
