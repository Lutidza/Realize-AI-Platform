/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegration.hook.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Управляет операциями Codex и обновляет каталог только безопасным подключением.
 */

"use client";

import type {
  CodexIntegrationConnectionDTO,
  SaveCodexIntegrationInput,
  TestCodexIntegrationDTO,
} from "@realize/ai-contracts";
import { useCallback, useState } from "react";
import { loadIntegrationCatalog } from "../integrationAPI";
import type {
  CodexIntegrationBusyAction,
  CodexIntegrationPanelProps,
} from "./CodexIntegrationPanel.types";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";
import { useCodexLogin } from "./useCodexLogin.hook";

/** Состояние Codex отделено от GitHub; результат проверки обновляет сохранённую revision. */
export const useCodexIntegration = ({
  onConnectionChange,
}: CodexIntegrationPanelProps) => {
  const [busyAction, setBusyAction] = useState<CodexIntegrationBusyAction>();
  const [error, setError] = useState<string>();
  const [testResult, setTestResult] = useState<TestCodexIntegrationDTO>();
  const [hasSavedNotice, setSavedNotice] = useState(false);

  const acceptLogin = useCallback(
    (connection: CodexIntegrationConnectionDTO) => {
      onConnectionChange(connection);
      setTestResult(undefined);
      setError(undefined);
      setSavedNotice(true);
    },
    [onConnectionChange],
  );
  const login = useCodexLogin({ onCompleted: acceptLogin });

  const save = async (input: SaveCodexIntegrationInput) => {
    setBusyAction("save");
    setError(undefined);
    setSavedNotice(false);
    try {
      const saved = await codexIntegrationAPI.save(input);
      onConnectionChange(saved);
      setTestResult(undefined);
      setSavedNotice(true);
      return saved;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить подключение Codex.",
      );
    } finally {
      setBusyAction(undefined);
    }
  };

  const test = async (revision: number) => {
    setBusyAction("test");
    setError(undefined);
    setSavedNotice(false);
    try {
      const result = await codexIntegrationAPI.test({
        expectedRevision: revision,
      });
      setTestResult(result);
      const catalog = await loadIntegrationCatalog();
      onConnectionChange(
        catalog.connections.find((item) => item.provider === "codex"),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось проверить подключение Codex.",
      );
    } finally {
      setBusyAction(undefined);
    }
  };

  const disconnect = async (revision: number) => {
    setBusyAction("disconnect");
    setError(undefined);
    try {
      await codexIntegrationAPI.disconnect({ expectedRevision: revision });
      onConnectionChange(undefined);
      setTestResult(undefined);
      setSavedNotice(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось отключить Codex.",
      );
      return false;
    } finally {
      setBusyAction(undefined);
    }
  };

  return {
    busyAction,
    clearNotice: () => {
      setSavedNotice(false);
      setTestResult(undefined);
      setError(undefined);
      login.clearError();
    },
    disconnect,
    error,
    hasSavedNotice,
    login,
    save,
    test,
    testResult,
  };
};
