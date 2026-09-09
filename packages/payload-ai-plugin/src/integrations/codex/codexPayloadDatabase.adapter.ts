/**
 * @file packages/payload-ai-plugin/src/integrations/codex/codexPayloadDatabase.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Предоставляет существующий Payload PostgreSQL pool операциям Codex.
 */

import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import type { CodexPayloadDatabase } from "./CodexConnectionMutation.types";

/** Не создаёт отдельный DB pool и не открывает новое хранилище. */
export const codexPayloadPool = (req: PayloadRequest) => {
  const pool = (req.payload.db as unknown as CodexPayloadDatabase).pool;
  if (!pool)
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Хранилище подключений Codex недоступно.",
      503,
    );
  return pool;
};
