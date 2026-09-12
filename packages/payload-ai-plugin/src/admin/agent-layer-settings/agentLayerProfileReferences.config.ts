/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/agentLayerProfileReferences.config.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Связывает семь полей профиля с видами записей и понятными названиями выбора.
 */

import type { AgentLayerProfileReferenceDefinition } from "./AgentLayerProfileEditor.types";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";

export const AGENT_LAYER_PROFILE_REFERENCES: readonly AgentLayerProfileReferenceDefinition[] =
  [
    {
      field: "roleKeys",
      kind: "local_role",
      label: AGENT_LAYER_KIND_LABELS.local_role,
      description: "Обязанности и инструкции, которые входят в профиль агента.",
    },
    {
      field: "skillKeys",
      kind: "skill",
      label: AGENT_LAYER_KIND_LABELS.skill,
      description: "Процедуры и условия их применения для этого профиля.",
    },
    {
      field: "ruleKeys",
      kind: "local_rule",
      label: AGENT_LAYER_KIND_LABELS.local_rule,
      description: "Требования и ограничения, которые должен учитывать агент.",
    },
    {
      field: "promptTemplateKeys",
      kind: "prompt_template",
      label: AGENT_LAYER_KIND_LABELS.prompt_template,
      description: "Шаблоны инструкций для работы агента.",
    },
    {
      field: "workflowKeys",
      kind: "workflow_definition",
      label: AGENT_LAYER_KIND_LABELS.workflow_definition,
      description: "Доступные последовательности шагов и процесс по умолчанию.",
    },
    {
      field: "capabilityBindingKeys",
      kind: "capability_binding",
      label: AGENT_LAYER_KIND_LABELS.capability_binding,
      description:
        "Дополнительные возможности профиля. Роли, навыки и процессы могут ссылаться на свои возможности.",
    },
    {
      field: "checkBindingKeys",
      kind: "check_binding",
      label: AGENT_LAYER_KIND_LABELS.check_binding,
      description: "Проверки, включённые непосредственно в профиль.",
    },
  ];
