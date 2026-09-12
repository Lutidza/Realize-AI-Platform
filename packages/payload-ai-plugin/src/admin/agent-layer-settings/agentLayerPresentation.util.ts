/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/agentLayerPresentation.util.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Форматирует состояния и сведения конфигурации для русскоязычного интерфейса.
 */

import type {
  AIConfigArtifactKind,
  AIConfigDraft,
} from "@realize/ai-contracts";
import type { AgentLayerRuleFields } from "./AgentLayerEditor.types";
import type { AgentLayerRuleInput } from "./AgentLayerConfiguration.types";

export const AGENT_LAYER_STATE_LABELS: Record<AIConfigDraft["state"], string> =
  {
    editing: "Редактируется",
    ready: "Проверен",
    validating: "Проверяется",
    released: "Выпущен",
  };
export const AGENT_LAYER_KIND_LABELS: Record<AIConfigArtifactKind, string> = {
  agent_profile: "Профили агентов",
  capability_binding: "Возможности",
  check_binding: "Проверки",
  local_role: "Роли",
  local_rule: "Правила",
  prompt_template: "Шаблоны инструкций",
  skill: "Навыки",
  workflow_definition: "Рабочие процессы",
};
export const formatAgentLayerDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const getAgentLayerRuleFields = (
  input?: AgentLayerRuleInput,
): AgentLayerRuleFields => ({
  key: input?.key ?? "",
  title: input?.title ?? "",
  instruction: input?.instruction ?? "",
  priority: String(input?.priority ?? 50),
  enabled: input?.enabled ?? true,
});
/** Повторяет ограничения полей формы; окончательную проверку выполняет Config API. */
export const getAgentLayerRuleFormError = (
  fields: AgentLayerRuleFields,
): string | undefined => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(fields.key))
    return "Ключ: от 1 до 128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.";
  if (!fields.title.trim() || fields.title.length > 120)
    return "Укажите название длиной до 120 символов.";
  if (!fields.instruction.trim() || fields.instruction.length > 8000)
    return "Укажите инструкцию длиной до 8000 символов.";
  const priority = Number(fields.priority);
  if (
    !fields.priority.trim() ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 100
  )
    return "Приоритет — целое число от 0 до 100.";
  return undefined;
};
