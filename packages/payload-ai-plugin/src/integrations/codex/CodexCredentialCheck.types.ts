/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexCredentialCheck.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Серверный ввод проверки Codex с обязательной внешней блокировкой профиля аккаунта.
 */

import type { CodexAuthMode } from "@realize/ai-contracts";
import type { CodexConnectionLease } from "./runtime/CodexConnection.types";

export type CodexCredentialCheckInput = {
  authJSON?: string;
  authMode: CodexAuthMode;
  profile?: Pick<CodexConnectionLease, "home" | "environment" | "signal">;
};
