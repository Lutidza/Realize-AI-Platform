/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexIntegrationPanel.component.tsx
 * @version 1.3.0
 * @date 2026-09-11
 * @description Связывает отдельное состояние Codex и его представление настроек.
 */

"use client";

import { UiTabs } from "@realize/ui-kit";
import { Bot, Cable, MessageSquare, Wrench } from "lucide-react";
import type { CodexIntegrationPanelProps } from "./CodexIntegrationPanel.types";
import { CodexIntegrationPanelView } from "./CodexIntegrationPanel.view";
import { useCodexIntegrationPanel } from "./useCodexIntegrationPanel.hook";
import { CodexAgentSettingsView } from "./CodexAgentSettings.view";
import { CodexChatSettingsView } from "./CodexChatSettings.view";
import { CodexAgentDiagnosticsView } from "./CodexAgentDiagnostics.view";
import styles from "./CodexChatSettings.module.css";

export const CodexIntegrationPanel = (props: CodexIntegrationPanelProps) => {
  const state = useCodexIntegrationPanel(props);
  return (
    <UiTabs
      label="Настройки GPT — Codex"
      value={state.tab}
      onValueChange={state.setTab}
      disabled={state.isBusy || state.agent.hasRetry || state.agent.isDirty}
      items={[
        {
          id: "connection",
          label: "Подключение",
          icon: <Cable size={17} />,
          content: <CodexIntegrationPanelView {...props} form={state.form} />,
        },
        {
          id: "agent",
          label: "Агент",
          icon: <Bot size={17} />,
          content: (
            <div className={styles.settings}>
              <CodexAgentDiagnosticsView
                state={state.diagnostics}
                onTest={state.testAccess}
                isTesting={state.form.operations.busyAction === "test"}
                isTestDisabled={state.isTestDisabled}
                testResult={
                  state.form.operations.busyAction ||
                  state.form.operations.error
                    ? undefined
                    : state.form.operations.testResult
                }
                testError={state.form.operations.error}
              />
              <CodexAgentSettingsView form={state.agent} />
            </div>
          ),
        },
        {
          id: "chat",
          label: "Чат",
          icon: <MessageSquare size={17} />,
          content: <CodexChatSettingsView form={state.chat} section="chat" />,
        },
        {
          id: "tools",
          label: "Инструменты",
          icon: <Wrench size={17} />,
          content: <CodexChatSettingsView form={state.chat} section="tools" />,
        },
      ]}
    />
  );
};
