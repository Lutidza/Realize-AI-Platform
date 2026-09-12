/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerBindingInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет структуру полей связей и числовой ввод, сохраняя незавершённую семантику черновика.
 */

import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;

const validateList = (
  values: readonly string[],
  label: string,
): string | undefined => {
  if (!Array.isArray(values) || values.length > 128)
    return `${label}: допускается не более 128 значений.`;
  if (
    values.some((value) => typeof value !== "string" || !STABLE_KEY.test(value))
  )
    return `${label}: каждое значение должно быть ключом из 1–128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.`;
  if (new Set(values).size !== values.length)
    return `${label}: значения не должны повторяться.`;
  return undefined;
};

/** Пустые действия и отсутствующие системные цели разрешены в draft; публикация проверяется сервером. */
export const validateAgentLayerBindingInput = (
  input: AgentLayerBindingInput,
): string | undefined => {
  if (typeof input.key !== "string" || !STABLE_KEY.test(input.key))
    return "Ключ: от 1 до 128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.";
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120
  )
    return "Название: укажите непустой текст длиной до 120 символов.";
  if (typeof input.enabled !== "boolean") return "Укажите состояние записи.";
  if (input.kind === "check_binding") {
    return typeof input.checkID === "string" && STABLE_KEY.test(input.checkID)
      ? undefined
      : "Выберите системную проверку с корректным идентификатором.";
  }
  if (
    typeof input.capability?.id !== "string" ||
    !STABLE_KEY.test(input.capability.id) ||
    typeof input.capability.version !== "string" ||
    !VERSION.test(input.capability.version)
  )
    return "Выберите системную возможность с точной числовой версией.";
  if (
    typeof input.maxTargets !== "string" ||
    (input.maxTargets !== "" &&
      (!/^\d+$/.test(input.maxTargets) ||
        !Number.isSafeInteger(Number(input.maxTargets)) ||
        Number(input.maxTargets) < 1))
  )
    return "Лимит объектов: укажите положительное целое число или оставьте поле пустым для системного лимита.";
  return (
    validateList(input.allowedActions, "Действия") ??
    (input.readScopes === undefined
      ? undefined
      : validateList(input.readScopes, "Области чтения")) ??
    (input.writeScopes === undefined
      ? undefined
      : validateList(input.writeScopes, "Области записи"))
  );
};
