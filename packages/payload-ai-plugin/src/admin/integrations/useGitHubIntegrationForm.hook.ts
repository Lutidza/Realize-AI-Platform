/**
 * @file packages/payload-ai-plugin/src/admin/integrations/useGitHubIntegrationForm.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Управляет черновиком подключения GitHub, валидацией автора и операциями формы.
 */

"use client";

import {
  parseGitCommitAuthor,
  type GitCommitAuthor,
  type GitHubIntegrationTestDTO,
} from "@realize/ai-contracts";
import { useId, useState } from "react";

import type { GitHubConnectionFieldsProps } from "./GitHubConnectionFields.types";
import type {
  GitHubCommitAuthorDraft,
  GitHubIntegrationPanelProps,
} from "./GitHubIntegrationPanel.types";

/** Token остаётся в памяти формы и очищается после успешного сохранения. */
export const useGitHubIntegrationForm = ({
  busyAction,
  connection,
  onDisconnect,
  onSave,
  onTest,
  vaultConfigured,
}: GitHubIntegrationPanelProps) => {
  const [displayName, setDisplayName] = useState(
    connection?.displayName || "Основной GitHub",
  );
  const [isEnabled, setEnabled] = useState(connection?.enabled ?? true);
  const [repositoryURL, setRepositoryURL] = useState(
    connection?.configuration.repositoryURL || "",
  );
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<GitHubIntegrationTestDTO>();
  const [hasSavedNotice, setSavedNotice] = useState(false);
  const commitAuthorErrorID = useId();
  const savedAuthor = connection?.configuration.commitAuthor;
  const authorSourceKey = JSON.stringify([
    connection?.id,
    savedAuthor?.name,
    savedAuthor?.email,
  ]);
  const [authorDraft, setAuthorDraft] = useState<GitHubCommitAuthorDraft>({
    email: savedAuthor?.email || "",
    name: savedAuthor?.name || "",
    sourceKey: authorSourceKey,
  });

  // Обновление test status не сбрасывает черновик; смена сохранённого автора обновляет поля.
  if (authorDraft.sourceKey !== authorSourceKey) {
    setAuthorDraft({
      email: savedAuthor?.email || "",
      name: savedAuthor?.name || "",
      sourceKey: authorSourceKey,
    });
  }

  let commitAuthor: GitCommitAuthor | null = null;
  let commitAuthorError: string | undefined;
  if (authorDraft.name.trim() || authorDraft.email.trim()) {
    try {
      commitAuthor = parseGitCommitAuthor({
        name: authorDraft.name,
        email: authorDraft.email,
      });
    } catch {
      commitAuthorError =
        !authorDraft.name.trim() || !authorDraft.email.trim()
          ? "Заполните имя и email автора коммитов или очистите оба поля."
          : "Проверьте имя и email автора коммитов. Управляющие символы и угловые скобки недопустимы.";
    }
  }

  const isBusy = Boolean(busyAction);
  const canTest =
    vaultConfigured &&
    Boolean(repositoryURL.trim()) &&
    Boolean(token || connection?.hasCredential);
  const canSave = canTest && !commitAuthorError;

  const save = async () => {
    if (isBusy || !canSave) return;
    setSavedNotice(false);
    setTestResult(undefined);
    const saved = await onSave({
      commitAuthor,
      displayName,
      enabled: isEnabled,
      expectedRevision: connection?.revision || 0,
      repositoryURL,
      ...(token ? { token } : {}),
    });
    if (saved) {
      setDisplayName(saved.displayName);
      setEnabled(saved.enabled);
      setRepositoryURL(saved.configuration.repositoryURL);
      setAuthorDraft({
        email: saved.configuration.commitAuthor?.email || "",
        name: saved.configuration.commitAuthor?.name || "",
        sourceKey: authorSourceKey,
      });
      setToken("");
      setSavedNotice(true);
    }
  };

  const test = async () => {
    if (isBusy || !canTest) return;
    setSavedNotice(false);
    const result = await onTest({
      repositoryURL,
      ...(token ? { token } : {}),
    });
    if (result) setTestResult(result);
  };

  const disconnect = async () => {
    if (isBusy || !connection) return;
    const confirmed = window.confirm(
      "Отключить GitHub и удалить сохранённый credential?",
    );
    if (!confirmed) return;
    if (await onDisconnect(connection.revision)) {
      setRepositoryURL("");
      setAuthorDraft({ email: "", name: "", sourceKey: authorSourceKey });
      setToken("");
      setTestResult(undefined);
      setSavedNotice(false);
    }
  };

  const fields: GitHubConnectionFieldsProps = {
    commitAuthorEmail: authorDraft.email,
    commitAuthorError,
    commitAuthorErrorID,
    commitAuthorName: authorDraft.name,
    displayName,
    hasCredential: Boolean(connection?.hasCredential),
    isDisabled: isBusy || !vaultConfigured,
    isEnabled,
    onCommitAuthorEmailChange: (email) => {
      setAuthorDraft((current) => ({ ...current, email }));
      setSavedNotice(false);
    },
    onCommitAuthorNameChange: (name) => {
      setAuthorDraft((current) => ({ ...current, name }));
      setSavedNotice(false);
    },
    onDisplayNameChange: setDisplayName,
    onEnabledChange: setEnabled,
    onRepositoryURLChange: setRepositoryURL,
    onTokenChange: setToken,
    repositoryURL,
    token,
  };

  return {
    canSave,
    canTest,
    disconnect,
    fields,
    hasSavedNotice,
    isBusy,
    save,
    test,
    testResult,
  };
};
