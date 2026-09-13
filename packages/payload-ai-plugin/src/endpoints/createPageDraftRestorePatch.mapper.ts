/**
 * @file packages/payload-ai-plugin/src/endpoints/createPageDraftRestorePatch.mapper.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Восстанавливает исходные значения подтверждённых полей, сохраняя явные null.
 */
import type { PageDraftTextChange } from "@realize/ai-contracts";
import { EndpointError } from "./http";
import { pageDraftTextPath } from "./pageDraftTextPath.util";

/** Отсутствующее optional поле передаётся как null: Payload не очищает его при omission. */
export const createPageDraftRestorePatch = (
  before: Record<string, unknown>,
  current: Record<string, unknown>,
  changes: PageDraftTextChange[],
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const change of changes) {
    const parts = pageDraftTextPath(change.path);
    if (!Object.hasOwn(patch, parts[0]))
      patch[parts[0]] = structuredClone(current[parts[0]]);
    let source: unknown = before;
    let target: unknown = patch;
    for (let index = 0; index < parts.length - 1; index++) {
      source =
        source && typeof source === "object"
          ? (source as Record<string, unknown>)[parts[index]]
          : undefined;
      target =
        target && typeof target === "object"
          ? (target as Record<string, unknown>)[parts[index]]
          : undefined;
    }
    if (!target || typeof target !== "object")
      throw new EndpointError(
        "CONFLICT",
        "Исходное текстовое поле нельзя безопасно восстановить.",
        409,
      );
    const key = parts.at(-1)!;
    const value =
      source && typeof source === "object"
        ? (source as Record<string, unknown>)[key]
        : undefined;
    if (value != null && typeof value !== "string")
      throw new EndpointError(
        "CONFLICT",
        "Исходное значение поля не является текстом.",
        409,
      );
    (target as Record<string, unknown>)[key] = value ?? null;
  }
  return patch;
};
