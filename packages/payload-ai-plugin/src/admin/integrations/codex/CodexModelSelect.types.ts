/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexModelSelect.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Задаёт props общего picker моделей внутри Codex settings.
 */
import type { CodexModelDTO } from "@realize/ai-contracts";

export type CodexModelSelectProps = {
  models?: readonly CodexModelDTO[];
  value: string;
  disabled: boolean;
  emptyLabel: string;
  onChange: (model: string) => void;
};
