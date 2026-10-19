/**
 * @file packages/payload-task-manager/src/server/validateTaskParticipantIds.validator.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет совместимость публичных actor IDs с host collection до SQL-запроса.
 * @see documentation/specifications/task-management-execution.md
 */
import type { CollectionSlug, PayloadRequest } from "payload";
import { TaskManagerError } from "./TaskManager.error";

/** Custom text IDs остаются строками; PostgreSQL serial требует канонический положительный int32. */
export function validateTaskParticipantIds(
  req: PayloadRequest,
  collection: CollectionSlug,
  ids: string[],
): void {
  const customType = req.payload.collections[collection]?.customIDType;
  const idType = customType ?? req.payload.db.defaultIDType;
  if (idType !== "number") return;
  const invalid = ids.some((id) => {
    const numeric = Number(id);
    if (customType === "number")
      return !Number.isFinite(numeric) || String(numeric) !== id;
    return (
      !/^[1-9][0-9]*$/.test(id) ||
      !Number.isSafeInteger(numeric) ||
      numeric > 2147483647
    );
  });
  if (invalid)
    throw new TaskManagerError(
      "INVALID_REQUEST",
      "Идентификатор участника не соответствует хранилищу пользователей.",
      422,
      { memberIds: ["Выберите доступных участников."] },
    );
}
