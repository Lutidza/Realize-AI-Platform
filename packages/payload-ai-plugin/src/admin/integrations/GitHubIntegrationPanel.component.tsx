/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubIntegrationPanel.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает состояние формы GitHub с представлением панели интеграции.
 */

"use client";

import type { GitHubIntegrationPanelProps } from "./GitHubIntegrationPanel.types";
import { GitHubIntegrationPanelView } from "./GitHubIntegrationPanel.view";
import { useGitHubIntegrationForm } from "./useGitHubIntegrationForm.hook";

/** Показывает настройки подключения и автора коммитов из безопасного DTO. */
export const GitHubIntegrationPanel = (props: GitHubIntegrationPanelProps) => {
  const form = useGitHubIntegrationForm(props);

  return (
    <GitHubIntegrationPanelView
      busyAction={props.busyAction}
      connection={props.connection}
      form={form}
      vaultConfigured={props.vaultConfigured}
    />
  );
};
