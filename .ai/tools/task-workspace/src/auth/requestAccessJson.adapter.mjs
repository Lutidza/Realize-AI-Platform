/**
 * @file .ai/tools/task-workspace/src/auth/requestAccessJson.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Использует bounded HTTP transport доступа и выдаёт только безопасные фиксированные ошибки.
 * @see documentation/architecture/platform-access.md
 */
import { requestTaskManagerJson } from "../remote/requestTaskManagerJson.adapter.mjs";
import { accessBaseUrl } from "./normalizeTaskManagerUrl.validator.mjs";
import { fail } from "../Workspace.error.mjs";

/** Refresh вызывается ровно один раз; ошибочный или неоднозначный ответ не повторяется transport.
 * @type {import('./Auth.types').AccessTransport} */
export async function requestAccessJson(baseUrl, input) {
  const result = await requestTaskManagerJson(
    { baseUrl: accessBaseUrl(baseUrl), token: input.token },
    input,
    {
      timeoutMs: input.timeoutMs ?? 10000,
      responseLimit: 65536,
      signal: input.signal,
    },
  );
  if (input.signal?.aborted) fail("auth_cancelled", "Подключение отменено.");
  if (result.kind === "unavailable")
    fail(
      "auth_preconnect_unavailable",
      "Соединение с сервером доступа не установлено; запрос не был отправлен.",
    );
  if (result.kind !== "response")
    fail("auth_transport_failed", "Результат запроса доступа не подтверждён.");
  if (result.status < 200 || result.status >= 300)
    fail(`auth_http_${result.status}`, "Сервер отклонил запрос доступа.");
  return result.value;
}
