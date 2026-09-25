/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/useMcpChatGptForm.hook.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сохраняет черновик ChatGPT при ошибке и держит новый ключ только в памяти формы.
 */
"use client";
import { useEffect, useState } from "react";
import type { McpChatGptConnectionProps } from "./McpServersClient.types";

export function useMcpChatGptForm({
  server,
  onDirtyChange,
  onSave,
}: McpChatGptConnectionProps) {
  const [initial] = useState(() => ({
    tunnelID: server.chatgpt?.tunnelID ?? "",
    apiKey: "",
    grants: server.chatgpt?.grants ?? {
      repositoryRead: false,
      pagesRead: false,
    },
    expires: (
      server.chatgpt?.expiresAt ??
      new Date(Date.now() + 90 * 86400000).toISOString()
    ).slice(0, 10),
    revision: server.desiredRevision,
  }));
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return {
    draft,
    setDraft,
    dirty,
    save: () =>
      onSave({
        expectedRevision: initial.revision,
        tunnelID: draft.tunnelID.trim(),
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
        grants: draft.grants,
        expiresAt: new Date(`${draft.expires}T23:59:59Z`).toISOString(),
      }),
  };
}
