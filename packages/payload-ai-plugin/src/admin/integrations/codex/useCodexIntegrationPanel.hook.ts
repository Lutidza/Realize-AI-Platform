/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegrationPanel.hook.ts
 * @version 1.2.0
 * @date 2026-09-11
 * @description Согласует вкладки подключения и чата с занятостью общей страницы.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CodexIntegrationPanelProps } from "./CodexIntegrationPanel.types";
import { useAdminFormLeaveGuard } from "../../ui/useAdminFormLeaveGuard.hook";
import { CHAT_SETTINGS_UPDATED_EVENT } from "../../chat-presentation/chatPresentation.constants";
import { useCodexAgentSettings } from "./useCodexAgentSettings.hook";
import { useCodexIntegration } from "./useCodexIntegration.hook";
import { useCodexIntegrationForm } from "./useCodexIntegrationForm.hook";
import { useCodexChatSettings } from "./useCodexChatSettings.hook";
import { useCodexIntegrationTab } from "./useCodexIntegrationTab.hook";
import { useCodexAgentDiagnostics } from "./useCodexAgentDiagnostics.hook";

export const useCodexIntegrationPanel = (props: CodexIntegrationPanelProps) => {
  const testInFlight = useRef(false);
  const { onConnectionChange } = props;
  const acceptConnection = useCallback<
    CodexIntegrationPanelProps["onConnectionChange"]
  >(
    (connection) => {
      onConnectionChange(connection);
      window.dispatchEvent(new Event(CHAT_SETTINGS_UPDATED_EVENT));
    },
    [onConnectionChange],
  );
  const shared = { ...props, onConnectionChange: acceptConnection };
  const operations = useCodexIntegration(shared);
  const connectionForm = useCodexIntegrationForm({ ...shared, operations });
  const chatForm = useCodexChatSettings({
    ...shared,
    disabled: connectionForm.isBusy,
  });
  const agent = useCodexAgentSettings({
    ...shared,
    disabled:
      connectionForm.isBusy ||
      chatForm.isSaving ||
      chatForm.isDirty ||
      connectionForm.hasUnsavedChanges,
  });
  const blocksOtherForms = agent.isDirty || agent.isSaving || agent.hasRetry;
  const form = {
    ...connectionForm,
    isBusy: connectionForm.isBusy || blocksOtherForms,
    isDisabled: connectionForm.isDisabled || blocksOtherForms,
  };
  const chat = {
    ...chatForm,
    isDisabled: chatForm.isDisabled || blocksOtherForms,
  };
  useAdminFormLeaveGuard(agent.isDirty || agent.isSaving || agent.hasRetry);
  const { tab, setTab } = useCodexIntegrationTab();
  const diagnostics = useCodexAgentDiagnostics({
    active: tab === "agent",
    connection: props.connection,
  });
  const isTestDisabled =
    form.isBusy ||
    !form.canTest ||
    connectionForm.hasUnsavedChanges ||
    chat.isDirty ||
    chat.isSaving ||
    agent.isBlocked ||
    diagnostics.isLoading;
  const testAccess = async () => {
    if (isTestDisabled || !props.connection || testInFlight.current) return;
    testInFlight.current = true;
    try {
      await operations.test(
        diagnostics.diagnostics?.connection?.revision ??
          props.connection.revision,
      );
      diagnostics.refresh();
    } finally {
      testInFlight.current = false;
    }
  };
  const isBusy = connectionForm.isBusy || chat.isSaving || agent.isSaving;
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange(isBusy || agent.isDirty || agent.hasRetry);
    return () => onBusyChange(false);
  }, [isBusy, agent.isDirty, agent.hasRetry, onBusyChange]);
  return {
    form,
    chat,
    agent,
    tab,
    setTab,
    isBusy,
    diagnostics,
    testAccess,
    isTestDisabled,
  };
};
