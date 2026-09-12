/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerProfileInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет локальную структуру профиля без блокировки сохранения семантически незавершённого черновика.
 */

import type { AgentLayerProfileInput } from "./AgentLayerConfiguration.types";
import { AGENT_LAYER_PROFILE_REFERENCES } from "./agentLayerProfileReferences.config";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Наличие и состояние целей проверяются отдельно: этот validator не удаляет связи. */
export const validateAgentLayerProfileInput = (
  input: AgentLayerProfileInput,
): string | undefined => {
  if (typeof input.key !== "string" || !STABLE_KEY.test(input.key)) {
    return "Ключ: от 1 до 128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.";
  }
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120
  )
    return "Укажите название длиной до 120 символов.";
  if (
    typeof input.description !== "string" ||
    !input.description.trim() ||
    input.description.length > 2000
  )
    return "Укажите назначение профиля длиной до 2000 символов.";
  if (
    typeof input.locale !== "string" ||
    input.locale.length > 16 ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(input.locale)
  )
    return "Укажите язык в формате ru, ru-RU или en-US.";
  if (typeof input.enabled !== "boolean") return "Укажите состояние профиля.";
  for (const { field, label } of AGENT_LAYER_PROFILE_REFERENCES) {
    const keys = input[field];
    if (!Array.isArray(keys) || keys.length > 128)
      return `${label}: выберите не более 128 записей.`;
    if (keys.some((key) => typeof key !== "string" || !STABLE_KEY.test(key)))
      return `${label}: связь содержит недопустимый ключ.`;
    if (new Set(keys).size !== keys.length)
      return `${label}: одна запись выбрана несколько раз.`;
  }
  if (input.defaultWorkflowKey !== undefined) {
    if (
      typeof input.defaultWorkflowKey !== "string" ||
      !STABLE_KEY.test(input.defaultWorkflowKey)
    )
      return "Процесс по умолчанию содержит недопустимый ключ.";
    if (!input.workflowKeys.includes(input.defaultWorkflowKey))
      return "Процесс по умолчанию должен входить в выбранные рабочие процессы.";
  }
  return undefined;
};
