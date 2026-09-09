/**
 * @file packages/payload-ai-plugin/src/integrations/codex/withCodexMutationLock.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сериализует изменения настроек Codex с runtime и обновлением OAuth-токенов.
 */

import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import { codexPayloadPool } from "./codexPayloadDatabase.adapter";
import { acquireCodexConnectionLock } from "./runtime/CodexConnectionLock.adapter";

/** Lock общий с runtime lease; test уже держит его и повторно сюда не входит. */
export const withCodexMutationLock = async <T>(
  req: PayloadRequest,
  operation: () => Promise<T>,
): Promise<T> => {
  let lock;
  try {
    lock = await acquireCodexConnectionLock(codexPayloadPool(req));
  } catch {
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Codex занят или хранилище недоступно. Повторите действие после завершения текущей операции.",
      503,
    );
  }
  try {
    if (lock.signal.aborted)
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Соединение с хранилищем Codex прервано.",
        503,
      );
    return await operation();
  } finally {
    await lock.release();
  }
};
