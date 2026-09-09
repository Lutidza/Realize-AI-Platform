/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAuthOption.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает вариант подключения Codex для формы и сохранённой сводки.
 */

import type { CodexAuthMode, CodexLoginMethod } from "@realize/ai-contracts";

export type CodexAuthOption = {
  authMode: CodexAuthMode;
  loginMethod?: CodexLoginMethod;
  label: string;
  description: string;
};
