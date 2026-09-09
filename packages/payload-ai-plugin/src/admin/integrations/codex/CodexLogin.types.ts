/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexLogin.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет результат входа Codex для обновления формы подключения.
 */

import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";

export type CodexLoginOptions = {
  onCompleted: (connection: CodexIntegrationConnectionDTO) => void;
};
