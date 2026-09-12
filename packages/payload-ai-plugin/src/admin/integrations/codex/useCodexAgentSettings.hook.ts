/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexAgentSettings.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет операционные настройки и повторяет неподтверждённую запись с тем же ключом.
 */

"use client";

import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  parseCodexAgentSettings,
} from "@realize/ai-contracts";
import type { CodexAgentSettingsDTO } from "@realize/ai-contracts";
import { useRef, useState } from "react";
import { RealizeAIRequestError } from "../../RealizeAIRequest.error";
import { loadIntegrationCatalog } from "../integrationAPI";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";
import type {
  CodexAgentSettingsDraft,
  CodexAgentSettingsOptions,
  CodexAgentSettingsRequest,
} from "./CodexAgentSettings.types";

/** Несохранённый черновик не заменяется обновлением каталога; неизвестный результат нельзя отправить заново. */
export const useCodexAgentSettings = ({
  connection,
  onConnectionChange,
  disabled,
}: CodexAgentSettingsOptions) => {
  const saved = {
    enabled: connection?.enabled ?? false,
    settings: connection?.configuration.agent ?? CODEX_AGENT_SETTINGS_DEFAULTS,
  };
  const sourceKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<CodexAgentSettingsDraft>({
    ...saved,
    revision: connection?.revision ?? 0,
    sourceKey,
  });
  const [isSaving, setSaving] = useState(false);
  const [hasRetry, setRetry] = useState(false);
  const [error, setError] = useState<string>();
  const [hasSaved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<CodexAgentSettingsRequest | undefined>(undefined);
  const isDirty =
    JSON.stringify({ enabled: draft.enabled, settings: draft.settings }) !==
    draft.sourceKey;
  if (
    !isDirty &&
    !isSaving &&
    !hasRetry &&
    (draft.sourceKey !== sourceKey ||
      draft.revision !== (connection?.revision ?? 0))
  )
    setDraft({ ...saved, revision: connection?.revision ?? 0, sourceKey });
  const isDisabled = disabled || isSaving || hasRetry;
  const isConflicted =
    isDirty &&
    (draft.sourceKey !== sourceKey ||
      draft.revision !== (connection?.revision ?? 0));

  const update = (values: Partial<CodexAgentSettingsDTO>) => {
    if (isDisabled) return;
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, ...values },
    }));
    setError(undefined);
    setSaved(false);
  };
  const save = async () => {
    if (disabled || inFlight.current || (!isDirty && !pending.current)) return;
    let request = pending.current;
    if (!request) {
      try {
        request = {
          input: {
            expectedRevision: draft.revision,
            enabled: draft.enabled,
            settings: parseCodexAgentSettings(draft.settings),
          },
          idempotencyKey: `integration:${crypto.randomUUID()}`,
        };
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Проверьте настройки агента.",
        );
        return;
      }
    }
    inFlight.current = true;
    pending.current = request;
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const next = await codexIntegrationAPI.saveAgentSettings(
        request.input,
        request.idempotencyKey,
      );
      pending.current = undefined;
      setRetry(false);
      const nextSaved = {
        enabled: next.enabled,
        settings: next.configuration.agent,
      };
      setDraft({
        ...nextSaved,
        revision: next.revision,
        sourceKey: JSON.stringify(nextSaved),
      });
      onConnectionChange(next);
      setSaved(true);
    } catch (cause) {
      const rejected =
        cause instanceof RealizeAIRequestError &&
        cause.status !== undefined &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 429;
      if (rejected) pending.current = undefined;
      setRetry(Boolean(pending.current));
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить настройки агента.",
      );
      if (cause instanceof RealizeAIRequestError && cause.status === 409) {
        try {
          const catalog = await loadIntegrationCatalog();
          onConnectionChange(
            catalog.connections.find((item) => item.provider === "codex"),
          );
        } catch {
          /* Черновик сохраняется, даже если чтение актуальной ревизии недоступно. */
        }
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return {
    isBlocked: disabled,
    settings: draft.settings,
    enabled: draft.enabled,
    isSaving,
    isDirty,
    isDisabled,
    isConflicted,
    hasRetry,
    error,
    hasSaved,
    update,
    save,
    setEnabled: (enabled: boolean) => {
      if (isDisabled) return;
      setDraft((current) => ({ ...current, enabled }));
      setError(undefined);
      setSaved(false);
    },
    reset: () => {
      if (isDisabled) return;
      setDraft({ ...saved, revision: connection?.revision ?? 0, sourceKey });
      setError(undefined);
      setSaved(false);
    },
  };
};
