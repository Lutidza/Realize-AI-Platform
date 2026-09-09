/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubSettingsActions.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт доступность и операции панели действий настройки GitHub.
 */

import type { GitHubIntegrationPanelViewProps } from "./GitHubIntegrationPanel.types";

export type GitHubSettingsActionsProps = Pick<
  GitHubIntegrationPanelViewProps,
  "busyAction"
> & {
  form: Pick<
    GitHubIntegrationPanelViewProps["form"],
    "isBusy" | "canSave" | "canTest" | "save" | "test"
  >;
};
