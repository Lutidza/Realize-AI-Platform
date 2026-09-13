/**
 * @file packages/ai-contracts/src/parseChatMessageContext.validator.ts
 * @version 1.3.0
 * @date 2026-09-12
 * @description Проверяет параметры контекста одного сообщения без повышения полномочий.
 */
import type { CreateMessageInput } from "./api";
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PROJECT_FILE_LIMIT,
} from "./chatContext.constants";
import { ContractValidationError } from "./validation";
import { parseProjectFileReference } from "./parseProjectFileReference.validator";
import { parseAIChatConfigurationSelection } from "./parseAIChatConfigurationSelection.validator";
import { parseWorkflowStartInput } from "./parseWorkflowExecutionInput.validator";
import { parsePageDraftReference } from "./parsePageDraftContext.validator";
/** Отклоняет неизвестные опции, повторные ID и неподтверждённые capabilities. */
export const parseChatMessageContext = (
  input: Record<string, unknown>,
): Omit<CreateMessageInput, "content"> => {
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "content",
          "attachmentIDs",
          "projectFiles",
          "webSearch",
          "agentConfiguration",
          "workflow",
          "pageDraft",
        ].includes(key),
    )
  )
    throw new ContractValidationError("Неизвестный параметр сообщения.");
  if (input.webSearch !== undefined && typeof input.webSearch !== "boolean")
    throw new ContractValidationError(
      "Параметр веб-поиска должен быть логическим значением.",
    );
  const attachmentIDs = input.attachmentIDs ?? [];
  if (
    !Array.isArray(attachmentIDs) ||
    attachmentIDs.length > CHAT_ATTACHMENT_LIMITS.maxFiles ||
    attachmentIDs.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id),
    ) ||
    new Set(attachmentIDs).size !== attachmentIDs.length
  )
    throw new ContractValidationError("Некорректный список вложений.");
  const files = input.projectFiles ?? [];
  if (!Array.isArray(files) || files.length > CHAT_PROJECT_FILE_LIMIT)
    throw new ContractValidationError(
      "Допускается не больше 10 файлов проекта.",
    );
  const projectFiles = files.map(parseProjectFileReference);
  if (
    new Set(projectFiles.map((file) => file.path)).size !== projectFiles.length
  )
    throw new ContractValidationError("Файл проекта выбран повторно.");
  return {
    ...(input.pageDraft === undefined
      ? {}
      : { pageDraft: parsePageDraftReference(input.pageDraft) }),
    ...(input.workflow === undefined
      ? {}
      : { workflow: parseWorkflowStartInput(input.workflow) }),
    ...(input.agentConfiguration !== undefined
      ? {
          agentConfiguration: parseAIChatConfigurationSelection(
            input.agentConfiguration,
          ),
        }
      : {}),
    ...(input.attachmentIDs !== undefined ? { attachmentIDs } : {}),
    ...(input.projectFiles !== undefined ? { projectFiles } : {}),
    ...(input.webSearch !== undefined
      ? { webSearch: input.webSearch as boolean }
      : {}),
  };
};
