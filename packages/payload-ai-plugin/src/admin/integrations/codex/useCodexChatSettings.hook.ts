/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexChatSettings.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет черновик настроек чата независимо от данных авторизации.
 */

"use client";

import { CODEX_CHAT_SETTINGS_DEFAULTS } from "@realize/ai-contracts";
import type { CodexChatSettingsDto } from "@realize/ai-contracts";
import { useId, useState } from "react";
import {
  CHAT_OPEN_EVENT,
  CHAT_SETTINGS_UPDATED_EVENT,
} from "../../chat-presentation/chatPresentation.constants";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";
import type { CodexChatSettingsOptions } from "./CodexChatSettings.types";

export const useCodexChatSettings = ({
  connection,
  onConnectionChange,
  disabled,
}: CodexChatSettingsOptions) => {
  const saved = connection?.configuration.chat ?? CODEX_CHAT_SETTINGS_DEFAULTS;
  const sourceKey = JSON.stringify(saved);
  const [draft, setDraft] = useState({ settings: saved, sourceKey });
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [hasSaved, setHasSaved] = useState(false);
  const groupName = useId();
  if (draft.sourceKey !== sourceKey) setDraft({ settings: saved, sourceKey });
  const isDirty = JSON.stringify(draft.settings) !== sourceKey;
  const isDisabled = disabled || isSaving;
  const update = (values: Partial<CodexChatSettingsDto>) => {
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, ...values },
    }));
    setError(undefined);
    setHasSaved(false);
  };
  const save = async () => {
    if (isDisabled || !isDirty) return;
    setSaving(true);
    setError(undefined);
    setHasSaved(false);
    try {
      const next = await codexIntegrationAPI.saveChatSettings({
        expectedRevision: connection?.revision ?? 0,
        settings: draft.settings,
      });
      onConnectionChange(next);
      setHasSaved(true);
      window.dispatchEvent(new Event(CHAT_SETTINGS_UPDATED_EVENT));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить настройки чата.",
      );
    } finally {
      setSaving(false);
    }
  };
  return {
    settings: draft.settings,
    groupName,
    isSaving,
    isDirty,
    isDisabled,
    error,
    hasSaved,
    update,
    save,
    reset: () => {
      setDraft({ settings: saved, sourceKey });
      setError(undefined);
      setHasSaved(false);
    },
    openChat: () =>
      window.dispatchEvent(
        new CustomEvent(CHAT_OPEN_EVENT, {
          detail: { mode: saved.displayMode },
        }),
      ),
  };
};
