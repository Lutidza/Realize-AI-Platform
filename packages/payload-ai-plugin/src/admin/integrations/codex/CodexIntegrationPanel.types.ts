/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexIntegrationPanel.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет безопасные зависимости и состояние панели настроек Codex.
 */

import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";
import type { useCodexIntegration } from "./useCodexIntegration.hook";
import type { useCodexIntegrationForm } from "./useCodexIntegrationForm.hook";

/** Подключение обновляется через каталог; операции Codex имеют отдельное состояние. */
export type CodexIntegrationPanelProps = {
  connection?: CodexIntegrationConnectionDTO;
  isReloading: boolean;
  onBusyChange: (isBusy: boolean) => void;
  onConnectionChange: (connection?: CodexIntegrationConnectionDTO) => void;
  vaultConfigured: boolean;
};

export type CodexIntegrationBusyAction = "save" | "test" | "disconnect";

export type CodexIntegrationPanelViewProps = CodexIntegrationPanelProps & {
  form: ReturnType<typeof useCodexIntegrationForm>;
};

export type CodexIntegrationFormOptions = CodexIntegrationPanelProps & {
  operations: ReturnType<typeof useCodexIntegration>;
};
