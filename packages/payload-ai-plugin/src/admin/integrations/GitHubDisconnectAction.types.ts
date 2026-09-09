/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubDisconnectAction.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт состояние ожидания и операцию отключения GitHub.
 */

import type { GitHubIntegrationPanelViewProps } from "./GitHubIntegrationPanel.types";

export type GitHubDisconnectActionProps = Pick<
  GitHubIntegrationPanelViewProps,
  "busyAction"
> & {
  isBusy: boolean;
  onDisconnect: () => Promise<void>;
};
