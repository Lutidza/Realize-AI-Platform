/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/agentLayerEditableKinds.config.ts
 * @version 1.2.0
 * @date 2026-09-10
 * @description Задаёт подписи создания и пустых состояний редактируемых видов записей.
 */

import type { AgentLayerEditableKind } from "./AgentLayerCatalog.types";

/** Каталог и заголовок рабочей области используют одинаковые названия действий. */
export const AGENT_LAYER_CREATE_LABELS: Record<AgentLayerEditableKind, string> =
  {
    agent_profile: "Новый профиль",
    local_role: "Новая роль",
    skill: "Новый навык",
    local_rule: "Новое правило",
    prompt_template: "Новый шаблон",
    capability_binding: "Новая возможность",
    check_binding: "Новая проверка",
    workflow_definition: "Новый рабочий процесс",
  };

export const AGENT_LAYER_EDITABLE_KINDS = Object.keys(
  AGENT_LAYER_CREATE_LABELS,
) as AgentLayerEditableKind[];

export const AGENT_LAYER_CREATION_HINTS: Record<
  AgentLayerEditableKind,
  string
> = {
  agent_profile:
    "Добавьте профиль: задайте назначение агента и выберите его инструкции и возможности.",
  local_role:
    "Добавьте роль: опишите обязанности агента и выберите связанные возможности.",
  skill:
    "Добавьте навык: задайте инструкцию, условия применения и связанные возможности.",
  local_rule:
    "Добавьте правило: задайте инструкцию, которую можно связать с профилем агента.",
  prompt_template:
    "Добавьте шаблон: задайте текст инструкции и выберите место его применения.",
  capability_binding:
    "Добавьте возможность: выберите системную версию и настройте ограничения её использования.",
  check_binding:
    "Добавьте проверку из системного реестра для профилей и рабочих процессов.",
  workflow_definition:
    "Добавьте рабочий процесс: настройте шаги, переходы и связанные инструкции, возможности и проверки.",
};
