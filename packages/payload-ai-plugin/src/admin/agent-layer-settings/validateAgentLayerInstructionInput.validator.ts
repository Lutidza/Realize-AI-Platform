/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerInstructionInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет поля и ограничения формы инструкции без изменения введённого текста и списков.
 */

import type { AgentLayerInstructionInput } from "./AgentLayerInstruction.types";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const validateText = (
  value: string,
  label: string,
  maximum: number,
): string | undefined =>
  typeof value !== "string" || !value.trim() || value.length > maximum
    ? `${label}: укажите непустой текст длиной до ${maximum} символов.`
    : undefined;

const validateList = (
  values: readonly string[],
  label: string,
  mode: "key" | "term",
): string | undefined => {
  if (!Array.isArray(values) || values.length > 128)
    return `${label}: допускается не более 128 значений.`;
  if (
    values.some(
      (value) =>
        typeof value !== "string" ||
        (mode === "key"
          ? !STABLE_KEY.test(value)
          : !value.trim() || value.length > 120),
    )
  ) {
    return mode === "key"
      ? `${label}: каждое значение должно быть ключом из 1–128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.`
      : `${label}: каждая строка должна содержать непустой текст длиной до 120 символов.`;
  }
  if (new Set(values).size !== values.length)
    return `${label}: значения не должны повторяться.`;
  return undefined;
};

/** Отсутствующие возможности и несовпадение переменных с шаблоном остаются для проверки черновика. */
export const validateAgentLayerInstructionInput = (
  input: AgentLayerInstructionInput,
): string | undefined => {
  if (typeof input.key !== "string" || !STABLE_KEY.test(input.key))
    return "Ключ: от 1 до 128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.";
  const titleError = validateText(input.title, "Название", 120);
  if (titleError) return titleError;
  if (typeof input.enabled !== "boolean") return "Укажите состояние записи.";
  switch (input.kind) {
    case "local_role":
      return (
        validateText(input.instructions, "Инструкции роли", 16000) ??
        validateList(input.capabilityBindingKeys, "Возможности", "key")
      );
    case "skill":
      return (
        validateText(input.description, "Назначение навыка", 2000) ??
        validateText(input.instructions, "Инструкции навыка", 16000) ??
        validateList(input.capabilityBindingKeys, "Возможности", "key") ??
        validateList(input.triggerTerms, "Условия применения", "term")
      );
    case "prompt_template":
      if (
        ![
          "agent_instructions",
          "planner",
          "reviewer",
          "workflow_step",
        ].includes(input.slot)
      )
        return "Выберите назначение шаблона.";
      return (
        validateText(input.template, "Текст шаблона", 32000) ??
        validateList(input.variables, "Переменные", "key")
      );
  }
};
