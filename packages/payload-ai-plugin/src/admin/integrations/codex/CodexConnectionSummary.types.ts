/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexConnectionSummary.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет безопасные данные сводки сохранённого подключения Codex.
 */

import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";

export type CodexConnectionSummaryProps = {
  connection?: CodexIntegrationConnectionDTO;
};
