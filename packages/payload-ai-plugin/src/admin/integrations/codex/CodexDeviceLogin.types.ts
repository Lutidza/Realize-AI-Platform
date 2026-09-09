/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexDeviceLogin.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Определяет события входа Codex и безопасные props одноразового кода.
 */

import type { CodexLoginPendingDTO } from "@realize/ai-contracts";

export type CodexDeviceLoginProps = {
  isCancelling: boolean;
  isCopied: boolean;
  onCancel: () => Promise<void>;
  onCopy: () => Promise<void>;
  session: Extract<CodexLoginPendingDTO, { loginMethod: "deviceCode" }>;
};
