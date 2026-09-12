/**
 * @file packages/payload-ai-plugin/src/admin/chat/parseChatWorkflowInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Преобразует необязательный JSON composer через общий контракт входа процесса.
 */

import { parseWorkflowStartInput } from "@realize/ai-contracts";
import type { WorkflowStartInput } from "@realize/ai-contracts";

/** Пустое поле означает отсутствие дополнительных данных; пределы задаёт общий validator. */
export const parseChatWorkflowInput = (
  key: string,
  text: string,
): WorkflowStartInput => {
  let input: unknown;
  if (text.trim()) {
    if (text.length > 131072)
      throw new Error("Данные процесса превышают 128 КиБ.");
    try {
      input = JSON.parse(text);
    } catch {
      throw new Error(
        "Данные процесса должны содержать корректный JSON-объект.",
      );
    }
  }
  return parseWorkflowStartInput({
    key,
    ...(input !== undefined ? { input } : {}),
  });
};
