/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerProfileFields.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт отделённые редактируемые поля профиля без версии и вида артефакта.
 */

import type { AIAgentProfileDefinition } from "@realize/ai-contracts";
import type { AgentLayerProfileInput } from "./AgentLayerConfiguration.types";

/** Массивы формы не разделяют изменяемую память с загруженным черновиком. */
export const getAgentLayerProfileFields = (
  profile?: AIAgentProfileDefinition,
): AgentLayerProfileInput => ({
  key: profile?.key ?? "",
  title: profile?.title ?? "",
  description: profile?.description ?? "",
  locale: profile?.locale ?? "ru-RU",
  enabled: profile?.enabled ?? true,
  roleKeys: [...(profile?.roleKeys ?? [])],
  skillKeys: [...(profile?.skillKeys ?? [])],
  ruleKeys: [...(profile?.ruleKeys ?? [])],
  promptTemplateKeys: [...(profile?.promptTemplateKeys ?? [])],
  workflowKeys: [...(profile?.workflowKeys ?? [])],
  capabilityBindingKeys: [...(profile?.capabilityBindingKeys ?? [])],
  checkBindingKeys: [...(profile?.checkBindingKeys ?? [])],
  ...(profile?.defaultWorkflowKey
    ? { defaultWorkflowKey: profile.defaultWorkflowKey }
    : {}),
});
