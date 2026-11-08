/**
 * @file packages/engineering-runtime/src/contracts/hashEngineeringValue.util.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Вычисляет SHA-256 канонических команд и точных content bytes на сервере.
 * @see documentation/architecture/engineering-operations.md
 */
import { createHash } from "node:crypto";
import type { CanonicalEngineeringJsonOptions } from "./CanonicalEngineeringJson.types.ts";
import { canonicalEngineeringJson } from "./canonicalEngineeringJson.util.ts";

/** Hash versioned canonical JSON; legacy Task/Git hashes не изменяются. */
export function hashEngineeringValue(
  value: unknown,
  options?: CanonicalEngineeringJsonOptions,
): string {
  return sha256Bytes(canonicalEngineeringJson(value, options));
}

/** SHA-256 exact bytes; строки интерпретируются как UTF-8 без нормализации. */
export function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
