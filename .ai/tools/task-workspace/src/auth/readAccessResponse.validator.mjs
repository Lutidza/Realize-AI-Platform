/**
 * @file .ai/tools/task-workspace/src/auth/readAccessResponse.validator.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет публичный envelope доступа без отражения server messages и секретных полей.
 * @see documentation/architecture/platform-access.md
 */
import { z } from "zod";
import { fail } from "../Workspace.error.mjs";

/** @template T @param {z.ZodType<T>} schema @param {unknown} value @returns {T} */
export function readAccessResponse(schema, value) {
  const parsed = z
    .strictObject({ ok: z.literal(true), data: schema })
    .safeParse(value);
  if (!parsed.success)
    fail(
      "auth_contract_invalid",
      "Ответ доступа не соответствует публичному контракту.",
    );
  return parsed.data.data;
}
