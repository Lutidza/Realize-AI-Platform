/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowStepProblems.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Находит видимые проблемы ссылок и незавершённых полей шага без подмены серверной проверки графа.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowStepInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";

export const getAgentLayerWorkflowStepProblems = (
  step: AgentLayerWorkflowStepInput,
  workflow: AgentLayerWorkflowInput,
  artifacts: readonly AIConfigArtifact[],
): readonly string[] => {
  const problems: string[] = [];
  const stepKeys = new Set(workflow.steps.map((item) => item.key));
  const checkStep = (key: string, label: string) => {
    if (!key || !stepKeys.has(key))
      problems.push(
        `${label}: ${key ? `шаг «${key}» не найден` : "шаг не выбран"}.`,
      );
  };
  const checkSource = (
    source: AgentLayerWorkflowValueSourceInput,
    label: string,
  ) => {
    if (source.source === "step_output") checkStep(source.stepKey, label);
    if (source.source !== "literal" && !source.path.trim())
      problems.push(`${label}: путь к значению не указан.`);
  };
  const checkArtifact = (kind: AIConfigArtifact["kind"], key: string) => {
    const target = artifacts.find(
      (item) => item.kind === kind && item.key === key,
    );
    if (!target)
      problems.push(
        key
          ? `Связанная запись «${key}» не найдена.`
          : "Связанная запись не выбрана.",
      );
    else if (workflow.enabled && !target.enabled)
      problems.push(`Связанная запись «${target.title}» выключена.`);
  };
  if (step.keyInput !== step.key)
    problems.push("Примените или отмените изменение ключа шага.");
  if (workflow.steps.filter((item) => item.key === step.key).length > 1)
    problems.push("Ключ шага повторяется в процессе.");
  if (step.type === "branch") {
    checkStep(step.trueStepKey, "Переход при выполнении условия");
    checkStep(step.falseStepKey, "Переход при невыполнении условия");
    checkSource(step.condition.left, "Левая часть условия");
    if (step.condition.right)
      checkSource(step.condition.right, "Правая часть условия");
    if (step.condition.operator === "exists" && step.condition.right)
      problems.push("Для условия «Существует» удалите правую часть явно.");
    if (step.condition.operator !== "exists" && !step.condition.right)
      problems.push("Добавьте правую часть сравнения.");
  } else if (step.type !== "finish")
    checkStep(step.nextStepKey, "Следующий шаг");
  if (step.type === "agent_turn" || step.type === "request_input")
    checkArtifact("prompt_template", step.promptTemplateKey);
  if (step.type === "check")
    checkArtifact("check_binding", step.checkBindingKey);
  if (step.type === "capability") {
    checkArtifact("capability_binding", step.capabilityBindingKey);
    const keys = new Set<string>();
    for (const row of step.input) {
      if (!row.key) problems.push("У входного параметра не указано имя.");
      else if (keys.has(row.key))
        problems.push(`Имя входного параметра «${row.key}» повторяется.`);
      keys.add(row.key);
      checkSource(row.value, `Параметр «${row.key || "без имени"}»`);
    }
  }
  return [...new Set(problems)];
};
