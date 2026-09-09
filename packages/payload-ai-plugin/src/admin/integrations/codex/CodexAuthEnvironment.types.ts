/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAuthEnvironment.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает результат проверки сервера с текущим запросом формы.
 */

import type { CodexAuthEnvironmentDTO } from "@realize/ai-contracts";

export type CodexAuthEnvironmentState = {
  request: object;
  environment?: CodexAuthEnvironmentDTO;
  error?: string;
};
