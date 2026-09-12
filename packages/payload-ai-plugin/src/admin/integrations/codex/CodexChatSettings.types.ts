/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexChatSettings.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет зависимости формы настройки чата и её представлений.
 */

import type { CodexIntegrationPanelProps } from "./CodexIntegrationPanel.types";
import type { useCodexChatSettings } from "./useCodexChatSettings.hook";

export type CodexChatSettingsOptions = Pick<
  CodexIntegrationPanelProps,
  "connection" | "onConnectionChange"
> & { disabled: boolean };
export type CodexChatSettingsViewProps = {
  form: ReturnType<typeof useCodexChatSettings>;
  section: "chat" | "tools";
};
