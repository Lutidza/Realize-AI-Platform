/**
 * @file packages/payload-ai-plugin/src/admin/realizeAIAPI.ts
 * @version 1.1.0
 * @date 2026-09-20
 * @description Передаёт запросы Admin DTO и сохраняет безопасные признаки HTTP-ошибок.
 */

import { RealizeAIRequestError } from "./RealizeAIRequest.error";

import type { APIResponse } from "@realize/ai-contracts";

/** Относительный API namespace браузерного клиента Payload AI plugin. */
export const REALIZE_AI_API_ROOT = "/api/realize-ai";

/** Возвращает DTO успешного ответа, сохраняя HTTP-признаки отказа для retry и CAS. */
export const requestRealizeAI = async <T>(
  path: string,
  init?: RequestInit,
  apiRoot = REALIZE_AI_API_ROOT,
): Promise<T> => {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let envelope: APIResponse<T>;
  try {
    envelope = (await response.json()) as APIResponse<T>;
  } catch {
    throw new RealizeAIRequestError("Сервер вернул некорректный ответ.", {
      status: response.status,
    });
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    typeof envelope.ok !== "boolean"
  )
    throw new RealizeAIRequestError("Сервер вернул некорректный ответ.", {
      status: response.status,
    });
  if (!envelope.ok)
    throw new RealizeAIRequestError(
      envelope.error?.message ?? "Запрос отклонён сервером.",
      {
        status: response.status,
        code: envelope.error?.code,
        details: envelope.error?.details,
      },
    );
  if (!response.ok)
    throw new RealizeAIRequestError(
      "Сервер не подтвердил выполнение запроса.",
      { status: response.status },
    );
  return envelope.data;
};
