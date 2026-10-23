/**
 * @file packages/verification-runtime/src/hashVerificationRecipe.util.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Хеширует канонический recipe без чтения filesystem и без сохранения значений окружения.
 */
import { createHash } from "node:crypto";
import type { VerificationCheck } from "./Verification.types.ts";

export function hashVerificationValue(value: unknown): string {
  const canonical = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([a], [b]) => a.localeCompare(b, "en"))
              .map(([key, value]) => [key, canonical(value)]),
          )
        : entry;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** В отличие от full key, recipe можно сравнить с подтверждённым commit без текущего checkout. */
export function hashVerificationRecipe(check: VerificationCheck): string {
  return hashVerificationValue(check);
}
