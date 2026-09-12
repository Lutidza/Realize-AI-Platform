/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentSettings.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет черновик и зависимости административных настроек агента.
 */

import type {
  CodexAgentSettingsDTO,
  SaveCodexAgentSettingsInput,
} from "@realize/ai-contracts";
import type { CodexChatSettingsOptions } from "./CodexChatSettings.types";
import type { useCodexAgentSettings } from "./useCodexAgentSettings.hook";

export type CodexAgentSettingsOptions = CodexChatSettingsOptions;
export type CodexAgentSettingsDraft = {
  enabled: boolean;
  settings: CodexAgentSettingsDTO;
  revision: number;
  sourceKey: string;
};
export type CodexAgentSettingsRequest = {
  input: SaveCodexAgentSettingsInput;
  idempotencyKey: string;
};
export type CodexAgentSettingsViewProps = {
  form: ReturnType<typeof useCodexAgentSettings>;
};
