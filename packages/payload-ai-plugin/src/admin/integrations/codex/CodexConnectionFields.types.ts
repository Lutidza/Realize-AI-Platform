/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexConnectionFields.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Определяет редактируемые значения формы Codex и выбор способа входа.
 */

import type { CodexAuthMode, CodexLoginMethod } from "@realize/ai-contracts";
import type { useCodexIntegrationForm } from "./useCodexIntegrationForm.hook";

export type CodexIntegrationDraft = {
  apiKey: string;
  accessToken: string;
  loginMethod: CodexLoginMethod;
  authMode: CodexAuthMode;
  displayName: string;
  enabled: boolean;
  sourceKey: string;
};

export type CodexAuthModeFieldsProps = {
  authMode: CodexAuthMode;
  groupName: string;
  loginMethod: CodexLoginMethod;
  isDisabled: boolean;
  onChange: (mode: CodexAuthMode, method?: CodexLoginMethod) => void;
};

export type CodexConnectionFieldsProps = {
  form: ReturnType<typeof useCodexIntegrationForm>;
};
