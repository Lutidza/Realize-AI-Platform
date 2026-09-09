/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionSummary.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт сохранённое состояние для сводки подключения GitHub.
 */

import type { GitHubIntegrationPanelViewProps } from "./GitHubIntegrationPanel.types";

export type GitHubConnectionSummaryProps = Pick<
  GitHubIntegrationPanelViewProps,
  "connection"
>;
