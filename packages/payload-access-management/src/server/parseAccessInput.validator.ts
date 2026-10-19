/**
 * @file packages/payload-access-management/src/server/parseAccessInput.validator.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Преобразует ошибки входных схем в безопасный ответ без отражения пользовательских значений.
 * @see documentation/architecture/platform-access.md
 */
import type { z } from "zod";
import { AccessManagementError } from "./AccessManagement.error";
export function parseAccessInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AccessManagementError(
      "INVALID_REQUEST",
      "Проверьте параметры запроса.",
      422,
    );
  return parsed.data;
}
