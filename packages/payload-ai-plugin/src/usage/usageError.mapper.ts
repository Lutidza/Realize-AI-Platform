/**
 * @file packages/payload-ai-plugin/src/usage/usageError.mapper.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Отделяет ошибки контрактов и конфликты ledger от приватной ошибки PostgreSQL.
 */
import { ZodError } from "zod";
import { EndpointError } from "../endpoints/http";

export function usageError(error: unknown): never {
  if (error instanceof EndpointError) throw error;
  if (error instanceof ZodError)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Проверьте формат полей расходов и денежные значения.",
      400,
    );
  if (error instanceof Error && error.message === "USAGE_QUERY_TOO_WIDE")
    throw new EndpointError(
      "INVALID_REQUEST",
      "Слишком широкий срез. Уточните период, установку или модель.",
      400,
    );
  if (error instanceof Error && error.message === "USAGE_SCOPE_FORBIDDEN")
    throw new EndpointError("FORBIDDEN", "Недоступная область расходов.", 403);
  if (
    error instanceof Error &&
    /^USAGE_/.test(error.message) &&
    !["USAGE_STORE_UNAVAILABLE", "USAGE_STORE_BUSY"].includes(error.message)
  )
    throw new EndpointError(
      "CONFLICT",
      "Состояние или тариф изменились. Обновите страницу и проверьте данные.",
      409,
    );
  throw new EndpointError(
    "INTEGRATION_UNAVAILABLE",
    "Журнал расходов временно недоступен.",
    503,
  );
}
