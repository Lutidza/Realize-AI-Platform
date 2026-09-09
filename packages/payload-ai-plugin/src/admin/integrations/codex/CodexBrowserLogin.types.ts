/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexBrowserLogin.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет безопасную сессию и действия браузерного входа Codex.
 */

import type { CodexLoginPendingDTO } from "@realize/ai-contracts";

export type CodexBrowserLoginProps = {
  session: Extract<CodexLoginPendingDTO, { loginMethod: "browser" }>;
  callbackURL: string;
  isBusy: boolean;
  onCallbackURLChange: (value: string) => void;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
};
