/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegrationForm.hook.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Ведёт черновик подключения Codex и допустимые действия выбранного способа входа.
 */

"use client";

import type { CodexAuthMode, CodexLoginMethod } from "@realize/ai-contracts";
import { useId, useState } from "react";
import type { CodexIntegrationDraft } from "./CodexConnectionFields.types";
import type { CodexIntegrationFormOptions } from "./CodexIntegrationPanel.types";
import { useCodexAuthEnvironment } from "./useCodexAuthEnvironment.hook";

/** Несохранённый выбор способа не меняет сводку и не наследует credential другого способа. */
export const useCodexIntegrationForm = ({
  connection,
  isReloading,
  operations,
  vaultConfigured,
}: CodexIntegrationFormOptions) => {
  const groupName = useId();
  const sourceKey = JSON.stringify([
    connection?.id,
    connection?.configuration.authMode,
    connection?.configuration.loginMethod,
    connection?.displayName,
    connection?.enabled,
    connection?.credentialUpdatedAt,
  ]);
  const [draft, setDraft] = useState<CodexIntegrationDraft>({
    apiKey: "",
    accessToken: "",
    loginMethod:
      connection?.configuration.loginMethod ??
      (connection ? "deviceCode" : "browser"),
    authMode: connection?.configuration.authMode ?? "chatgpt",
    displayName: connection?.displayName ?? "Основной Codex",
    enabled: connection?.enabled ?? true,
    sourceKey,
  });

  if (draft.sourceKey !== sourceKey) {
    setDraft({
      apiKey: "",
      accessToken: "",
      loginMethod:
        connection?.configuration.loginMethod ??
        (connection ? "deviceCode" : "browser"),
      authMode: connection?.configuration.authMode ?? "chatgpt",
      displayName: connection?.displayName ?? "Основной Codex",
      enabled: connection?.enabled ?? true,
      sourceKey,
    });
  }

  const serverAuth = useCodexAuthEnvironment(
    draft.authMode === "workloadIdentity",
  );

  const hasMatchingCredential = Boolean(
    connection?.hasCredential &&
    connection.configuration.authMode === draft.authMode,
  );
  const isBusy = Boolean(
    isReloading ||
    operations.busyAction ||
    operations.login.isStarting ||
    operations.login.isCancelling ||
    operations.login.isCompleting ||
    operations.login.session,
  );
  const canStoreAccess =
    vaultConfigured || draft.authMode === "workloadIdentity";
  const isDisabled = isBusy || !canStoreAccess;
  const canSave =
    canStoreAccess &&
    (draft.authMode === "apiKey"
      ? Boolean(draft.apiKey.trim() || hasMatchingCredential)
      : draft.authMode === "accessToken"
        ? Boolean(draft.accessToken.trim() || hasMatchingCredential)
        : draft.authMode === "workloadIdentity"
          ? !serverAuth.isLoading &&
            Boolean(serverAuth.environment?.workloadIdentity.configured)
          : hasMatchingCredential);
  const hasUnsavedAccess =
    Boolean(draft.apiKey.trim()) ||
    Boolean(draft.accessToken.trim()) ||
    Boolean(connection && connection.configuration.authMode !== draft.authMode);
  const canTest =
    canStoreAccess &&
    Boolean(
      connection &&
      (connection.hasCredential ||
        connection.configuration.authMode === "workloadIdentity"),
    ) &&
    !hasUnsavedAccess;

  const update = (values: Partial<CodexIntegrationDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
    operations.clearNotice();
  };

  const save = async () => {
    if (isBusy || !canSave) return;
    const saved = await operations.save({
      authMode: draft.authMode,
      displayName: draft.displayName,
      enabled: draft.enabled,
      expectedRevision: connection?.revision ?? 0,
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      ...(draft.accessToken.trim()
        ? { accessToken: draft.accessToken.trim() }
        : {}),
      ...(draft.authMode === "chatgpt"
        ? { loginMethod: draft.loginMethod }
        : {}),
    });
    if (saved)
      setDraft((current) => ({ ...current, apiKey: "", accessToken: "" }));
  };

  const startLogin = async () => {
    if (isDisabled || draft.authMode !== "chatgpt") return;
    operations.clearNotice();
    await operations.login.start({
      loginMethod: draft.loginMethod,
      displayName: draft.displayName,
      enabled: draft.enabled,
      expectedRevision: connection?.revision ?? 0,
    });
  };

  const disconnect = async () => {
    if (isBusy || !connection) return;
    if (
      !window.confirm("Отключить Codex и удалить сохранённые данные доступа?")
    )
      return;
    await operations.disconnect(connection.revision);
  };

  return {
    canSave,
    canTest,
    disconnect,
    draft,
    groupName,
    hasMatchingCredential,
    hasUnsavedAccess,
    isBusy,
    isDisabled,
    onApiKeyChange: (apiKey: string) => update({ apiKey }),
    onAccessTokenChange: (accessToken: string) => update({ accessToken }),
    onAuthModeChange: (
      authMode: CodexAuthMode,
      loginMethod?: CodexLoginMethod,
    ) =>
      update({
        authMode,
        apiKey: "",
        accessToken: "",
        ...(loginMethod ? { loginMethod } : {}),
      }),
    onDisplayNameChange: (displayName: string) => update({ displayName }),
    onEnabledChange: (enabled: boolean) => update({ enabled }),
    operations,
    serverAuth,
    save,
    startLogin,
    test: async () => {
      if (!isBusy && canTest && connection)
        await operations.test(connection.revision);
    },
  };
};
