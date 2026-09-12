/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/parseAgentLayerFailure.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Различает известный отказ API и неизвестный результат записи без потери черновика.
 */
import { ContractValidationError } from "@realize/ai-contracts";
import { RealizeAIRequestError } from "../RealizeAIRequest.error";
import type { AgentLayerConfigurationFailure } from "./AgentLayerConfiguration.types";
export const parseAgentLayerFailure = (
  error: unknown,
): AgentLayerConfigurationFailure => {
  if (error instanceof ContractValidationError)
    return {
      kind: "validation",
      message:
        "Проверьте поля правила: ключ, название, инструкцию и приоритет от 0 до 100.",
      retryable: false,
    };
  if (error instanceof RealizeAIRequestError) {
    if (error.status === 409)
      return {
        kind: "conflict",
        message:
          "Черновик изменился на сервере. Ваши правки сохранены в форме. Загрузите актуальную версию перед повторным сохранением.",
        retryable: false,
      };
    if (error.status === 401 || error.status === 403)
      return {
        kind: "forbidden",
        message:
          "Недостаточно прав для управления агентским слоем. Проверьте вход и разрешения.",
        retryable: false,
      };
    if (error.status === 400)
      return {
        kind: "validation",
        message:
          "Сервер отклонил изменения. Проверьте поля, версии артефактов и ссылки на базовую версию.",
        retryable: false,
      };
    if (error.status === 404)
      return {
        kind: "unknown",
        message:
          "Черновик или базовая версия больше недоступны. Обновите список.",
        retryable: false,
      };
    if (error.status === 429)
      return {
        kind: "network",
        message:
          "Слишком много запросов. Подождите минуту и повторите действие.",
        retryable: true,
      };
  }
  return {
    kind: "network",
    message:
      "Не удалось получить подтверждение сервера. Повторите запрос: его содержимое и ключ отправки сохранены.",
    retryable: true,
  };
};
